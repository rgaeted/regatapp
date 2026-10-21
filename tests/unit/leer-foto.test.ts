import { describe, expect, it, vi } from 'vitest'
import { leerFoto, type Parsear } from '@/lib/ocr/leer'

const conf = { distancia_m: 0.9, tiempo: 0.9, spm_promedio: 0.9, fc_promedio: 0.9, calorias: 0.9, factor_arrastre: 0.9, splits: 0.9 }
const buena = {
  distancia_m: 2000, tiempo: '7:35.5', spm_promedio: 28, fc_promedio: null, calorias: 95, factor_arrastre: 125,
  splits: [{ orden: 1, distancia_m: 500, tiempo: '1:53.9', spm: null, fc: null }],
  confianza: conf,
}
const imagen = { base64: 'AAAA', mediaType: 'image/jpeg' as const }

const responde = (parsed_output: unknown, stop_reason: string | null = 'end_turn'): Parsear =>
  vi.fn(async () => ({ parsed_output, stop_reason }))

describe('leerFoto', () => {
  it('devuelve la lectura normalizada y la respuesta cruda', async () => {
    const r = await leerFoto(responde(buena), imagen, 'claude-sonnet-5-5')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lectura.tiempo_ds).toBe(4555)
    expect(r.cruda).toEqual(buena)
    expect(r.vacia).toBe(false)
  })

  it('manda la imagen como bloque base64 y el modelo pedido', async () => {
    const parse = responde(buena)
    await leerFoto(parse, imagen, 'claude-sonnet-5-5')
    const llamada = vi.mocked(parse).mock.calls[0][0]
    expect(llamada.model).toBe('claude-sonnet-5-5')
    const contenido = llamada.messages[0].content as { type: string; source?: { type: string; media_type: string; data: string } }[]
    const bloque = contenido.find((b) => b.type === 'image')
    expect(bloque?.source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'AAAA' })
  })

  it('una foto sin pantalla (todo null) es una lectura vacía, no un error', async () => {
    const vacia = { ...buena, distancia_m: null, tiempo: null, spm_promedio: null, calorias: null, factor_arrastre: null, splits: [] }
    const r = await leerFoto(responde(vacia), imagen, 'm')
    expect(r.ok && r.vacia).toBe(true)
  })

  it('sin salida interpretable → ilegible', async () => {
    expect(await leerFoto(responde(null), imagen, 'm')).toEqual({ ok: false, motivo: 'ilegible' })
    expect(await leerFoto(responde({ cualquier: 'cosa' }), imagen, 'm')).toEqual({ ok: false, motivo: 'ilegible' })
  })

  it('un rechazo del modelo se trata como no leída', async () => {
    expect(await leerFoto(responde(null, 'refusal'), imagen, 'm')).toEqual({ ok: false, motivo: 'rechazada' })
  })

  it('un fallo del SDK da error genérico y no filtra el mensaje', async () => {
    const falla: Parsear = async () => {
      throw new Error('clave sk-ant-secreta inválida')
    }
    const r = await leerFoto(falla, imagen, 'm')
    expect(r).toEqual({ ok: false, motivo: 'error' })
    expect(JSON.stringify(r)).not.toContain('sk-ant')
  })
})
