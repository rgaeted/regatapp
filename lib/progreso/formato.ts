import { TZ } from '@/lib/schemas/consentimiento'

const num = (n: number, decimales: number) =>
  n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

export function kilometros(metros: number): string {
  return metros === 0 ? '0 km' : `${num(metros / 1000, 1)} km`
}

/** "500 m", "2 km", "1,5 km". */
export function nombreDistancia(metros: number): string {
  if (metros < 1000) return `${metros} m`
  return `${num(metros / 1000, metros % 1000 === 0 ? 0 : 1)} km`
}

// Un día civil YYYY-MM-DD se interpreta a mediodía UTC para que ninguna zona lo mueva de día.
const instante = (f: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f}T12:00:00Z` : f)

export function fechaCorta(f: string): string {
  return instante(f).toLocaleDateString('es-CL', { timeZone: TZ, day: 'numeric', month: 'short' })
}

export function fechaLarga(f: string): string {
  return instante(f).toLocaleDateString('es-CL', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
}
