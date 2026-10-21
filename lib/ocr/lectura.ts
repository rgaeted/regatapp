import { z } from 'zod'
import type { EstadoFormulario } from '@/lib/sesion/formulario'
import { parseTiempo } from '@/lib/tiempo'

/** Umbral de AGENTS.md §5: bajo este valor el campo se resalta para revisarlo primero. */
export const UMBRAL_CONFIANZA = 0.85

/**
 * Lo que el modelo devuelve. Los tiempos van como se ven en pantalla ("7:35.5")
 * y el servidor los convierte: así el modelo no hace aritmética de décimas.
 * Sin límites numéricos en el esquema (la salida estructurada no los admite):
 * se recortan en `normalizarLectura`.
 */
export const lecturaModeloSchema = z.object({
  distancia_m: z.number().nullable(),
  tiempo: z.string().nullable(),
  spm_promedio: z.number().nullable(),
  fc_promedio: z.number().nullable(),
  calorias: z.number().nullable(),
  factor_arrastre: z.number().nullable(),
  splits: z.array(
    z.object({
      orden: z.number(),
      distancia_m: z.number().nullable(),
      tiempo: z.string().nullable(),
      spm: z.number().nullable(),
      fc: z.number().nullable(),
    }),
  ),
  confianza: z.object({
    distancia_m: z.number(),
    tiempo: z.number(),
    spm_promedio: z.number(),
    fc_promedio: z.number(),
    calorias: z.number(),
    factor_arrastre: z.number(),
    splits: z.number(),
  }),
})
export type CrudaModelo = z.infer<typeof lecturaModeloSchema>

export type CampoOcr =
  | 'distancia_m'
  | 'tiempo_ds'
  | 'spm_promedio'
  | 'fc_promedio'
  | 'calorias'
  | 'factor_arrastre'
  | 'splits'

export type LecturaOcr = {
  distancia_m: number | null
  tiempo_ds: number | null
  spm_promedio: number | null
  fc_promedio: number | null
  calorias: number | null
  factor_arrastre: number | null
  splits: { orden: number; distancia_m: number | null; tiempo_ds: number; spm: number | null; fc: number | null }[]
  confianza: Record<CampoOcr, number>
}

const entero = (n: number | null): number | null => (n !== null && Number.isFinite(n) && n > 0 ? Math.round(n) : null)
const decimal = (n: number | null): number | null => (n !== null && Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null)
const tiempo = (t: string | null): number | null => (t === null ? null : parseTiempo(t))
const confianza = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

/** Valida y convierte lo que dijo el modelo; lo inválido queda null, nunca se inventa. */
export function normalizarLectura(c: CrudaModelo): LecturaOcr {
  const ordenados = [...c.splits].sort((a, b) => a.orden - b.orden)
  const convertidos = ordenados.map((s) => ({ s, ds: tiempo(s.tiempo) }))
  // Todos los splits o ninguno: uno ilegible hace dudosa la tabla entera.
  const splitsOk = convertidos.length > 0 && convertidos.every((x) => x.ds !== null)
  const splits = splitsOk
    ? convertidos.map(({ s, ds }, i) => ({
        orden: i + 1,
        distancia_m: entero(s.distancia_m),
        tiempo_ds: ds as number,
        spm: decimal(s.spm),
        fc: entero(s.fc),
      }))
    : []
  const k = c.confianza
  return {
    distancia_m: entero(c.distancia_m),
    tiempo_ds: tiempo(c.tiempo),
    spm_promedio: decimal(c.spm_promedio),
    fc_promedio: entero(c.fc_promedio),
    calorias: entero(c.calorias),
    factor_arrastre: entero(c.factor_arrastre),
    splits,
    confianza: {
      distancia_m: confianza(k.distancia_m),
      tiempo_ds: confianza(k.tiempo),
      spm_promedio: confianza(k.spm_promedio),
      fc_promedio: confianza(k.fc_promedio),
      calorias: confianza(k.calorias),
      factor_arrastre: confianza(k.factor_arrastre),
      splits: convertidos.length > 0 && !splitsOk ? 0 : confianza(k.splits),
    },
  }
}

/**
 * Campos a revisar primero: confianza < 0.85, o distancia/tiempo que no se
 * pudieron leer. Sin splits leídos no hay nada que revisar en splits.
 */
export function camposDudosos(l: LecturaOcr): CampoOcr[] {
  const dudosos: CampoOcr[] = []
  const valores: Record<CampoOcr, unknown> = {
    distancia_m: l.distancia_m,
    tiempo_ds: l.tiempo_ds,
    spm_promedio: l.spm_promedio,
    fc_promedio: l.fc_promedio,
    calorias: l.calorias,
    factor_arrastre: l.factor_arrastre,
    splits: l.splits.length > 0 ? l.splits : null,
  }
  for (const campo of Object.keys(valores) as CampoOcr[]) {
    const clave = campo === 'splits' ? l.splits.length > 0 || l.confianza.splits === 0 : true
    const baja = l.confianza[campo] < UMBRAL_CONFIANZA && clave && (valores[campo] !== null || campo === 'splits')
    const esencialFaltante = (campo === 'distancia_m' || campo === 'tiempo_ds') && valores[campo] === null
    if (baja || esencialFaltante) dudosos.push(campo)
  }
  return dudosos
}

/** Dígitos que habría que teclear para obtener este tiempo (inversa de `digitosATiempo`). */
export function tiempoADigitos(ds: number): string {
  const d = ds % 10
  const totalSeg = Math.floor(ds / 10)
  const min = Math.floor(totalSeg / 60)
  return String(min * 1000 + (totalSeg % 60) * 10 + d)
}

const texto = (n: number | null): string => (n === null ? '' : String(n))

/** Estado del formulario de la fase 1 precargado con la lectura. */
export function lecturaAEstado(l: LecturaOcr, base: EstadoFormulario): EstadoFormulario {
  return {
    ...base,
    distancia: texto(l.distancia_m),
    tiempoDigitos: l.tiempo_ds === null ? '' : tiempoADigitos(l.tiempo_ds),
    nSplits: l.splits.length,
    splitsDigitos: l.splits.map((s) => tiempoADigitos(s.tiempo_ds)),
    extras: {
      ...base.extras,
      spm: texto(l.spm_promedio),
      fcPromedio: texto(l.fc_promedio),
      calorias: texto(l.calorias),
      drag: texto(l.factor_arrastre),
    },
  }
}

/**
 * ¿La persona corrigió algo de lo leído? Solo cuentan los datos de la pantalla
 * del PM5 (y los secundarios); elegir atleta, día o tipo no es corregir la lectura.
 */
export function huboCambios(leido: EstadoFormulario, final: EstadoFormulario): boolean {
  return (
    leido.distancia !== final.distancia ||
    leido.tiempoDigitos !== final.tiempoDigitos ||
    leido.nSplits !== final.nSplits ||
    leido.splitsDigitos.join('|') !== final.splitsDigitos.join('|') ||
    JSON.stringify(leido.extras) !== JSON.stringify(final.extras)
  )
}
