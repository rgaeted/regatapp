import { z } from 'zod'
import { atletaSchema } from './atleta'

export const TZ = 'America/Santiago'

export type Relacion = 'apoderado' | 'tutor_legal' | 'propio'

// Fecha civil (YYYY-MM-DD) de Santiago para un instante dado.
export function hoySantiago(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: TZ })
}

// 'propio' solo para mayores de 18 en Santiago; sin fecha de nacimiento se
// trata como menor (diseño §5.2). Misma regla que la RPC (age() de Postgres:
// quien nace un 29 de febrero cumple el 1 de marzo en años no bisiestos).
export function relacionPermitida(
  fechaNacimiento: string | null,
  relacion: Relacion,
  hoy: Date,
): boolean {
  if (relacion !== 'propio') return true
  if (!fechaNacimiento) return false
  const limite = `${Number(fechaNacimiento.slice(0, 4)) + 18}${fechaNacimiento.slice(4)}`
  const h = hoySantiago(hoy)
  // Sin 29 de febrero en el año de cumpleaños, se cumple el 1 de marzo.
  const cumple = fechaNacimiento.slice(5) === '02-29' && !esBisiesto(Number(limite.slice(0, 4)))
    ? `${limite.slice(0, 4)}-03-01`
    : limite
  return h >= cumple
}

function esBisiesto(a: number): boolean {
  return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
}

export const consentimientoSchema = z.object({
  otorgado_por_nombre: z.string().trim().min(1),
  otorgado_por_rut: z.string().trim().optional(),
  relacion: z.enum(['apoderado', 'tutor_legal', 'propio']),
  medio: z.enum(['papel', 'digital']),
  version_texto: z.string().trim().min(1),
  otorgado_en: z.iso.date().refine((f) => f <= hoySantiago(), 'La fecha no puede ser futura'),
})

export const altaAtletaSchema = z
  .object({ atleta: atletaSchema, consentimiento: consentimientoSchema })
  .superRefine((v, ctx) => {
    if (!relacionPermitida(v.atleta.fecha_nacimiento ?? null, v.consentimiento.relacion, new Date())) {
      ctx.addIssue({
        code: 'custom',
        path: ['consentimiento', 'relacion'],
        message: 'La relación "propio" solo es válida para mayores de 18 años con fecha de nacimiento',
      })
    }
  })
