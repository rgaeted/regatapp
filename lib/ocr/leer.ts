import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { lecturaModeloSchema, normalizarLectura, type CrudaModelo, type LecturaOcr } from './lectura'
import { PROMPT_SISTEMA, PROMPT_USUARIO } from './prompt'

export type TipoImagen = 'image/jpeg' | 'image/png' | 'image/webp'

export type ParametrosLectura = Parameters<Anthropic['messages']['parse']>[0]

/**
 * `client.messages.parse` del SDK, inyectado para poder probar sin red. Solo se
 * usan `parsed_output` y `stop_reason`.
 */
export type Parsear = (p: ParametrosLectura) => Promise<{ parsed_output: unknown; stop_reason: string | null }>

export type ResultadoLectura =
  | { ok: true; lectura: LecturaOcr; cruda: CrudaModelo; vacia: boolean }
  | { ok: false; motivo: 'ilegible' | 'rechazada' | 'error' }

/**
 * Lee una foto del PM5 con el modelo de visión. Nunca lanza ni devuelve
 * mensajes del SDK: cualquier fallo es un motivo cerrado y la persona sigue
 * con el formulario manual. Solo se llama desde el servidor.
 */
export async function leerFoto(
  parsear: Parsear,
  imagen: { base64: string; mediaType: TipoImagen },
  modelo: string,
): Promise<ResultadoLectura> {
  try {
    const r = await parsear({
      model: modelo,
      max_tokens: 2000,
      system: PROMPT_SISTEMA,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imagen.mediaType, data: imagen.base64 } },
            { type: 'text', text: PROMPT_USUARIO },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(lecturaModeloSchema), effort: 'medium' },
    })
    if (r.stop_reason === 'refusal') return { ok: false, motivo: 'rechazada' }
    const cruda = lecturaModeloSchema.safeParse(r.parsed_output)
    if (!cruda.success) return { ok: false, motivo: 'ilegible' }
    const lectura = normalizarLectura(cruda.data)
    const vacia = lectura.distancia_m === null && lectura.tiempo_ds === null && lectura.splits.length === 0
    return { ok: true, lectura, cruda: cruda.data, vacia }
  } catch (e) {
    // Solo el tipo y el código: el mensaje del SDK puede incluir detalles de la petición.
    const status = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : undefined
    console.error('OCR: falló la llamada al modelo', e instanceof Error ? e.name : typeof e, status ?? '')
    return { ok: false, motivo: 'error' }
  }
}
