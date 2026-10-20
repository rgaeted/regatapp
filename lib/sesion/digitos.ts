import { formatTiempo, parseTiempo } from '@/lib/tiempo'

/** Máximo de dígitos aceptados: 7 caben de sobra en un integer de décimas. */
const MAX_DIGITOS = 7

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITOS)
}

function partes(digitos: string): { min: number; seg: number; d: number } {
  return {
    d: Number(digitos.slice(-1)),
    seg: digitos.length > 1 ? Number(digitos.slice(-3, -1)) : 0,
    min: digitos.length > 3 ? Number(digitos.slice(0, -3)) : 0,
  }
}

/** Décimas de los dígitos tecleados; null si vacío o segundos ≥ 60. */
export function digitosATiempo(digitos: string): number | null {
  if (digitos === '') return null
  return parseTiempo(digitos)
}

/** Muestra el tiempo en construcción, de derecha a izquierda (diseño §4). */
export function formatearDigitos(digitos: string): string {
  if (digitos === '') return ''
  const ds = digitosATiempo(digitos)
  if (ds !== null) return formatTiempo(ds)
  const { min, seg, d } = partes(digitos)
  return `${min}:${String(seg).padStart(2, '0')}.${d}`
}

/** Texto pegado (`2:07.3`) o tecleado, convertido a los dígitos equivalentes. */
export function interpretarTiempoPegado(texto: string): string {
  if (!/[:.]/.test(texto)) return soloDigitos(texto)
  const ds = parseTiempo(texto)
  if (ds === null) return ''
  const d = ds % 10
  const totalSeg = Math.floor(ds / 10)
  const min = Math.floor(totalSeg / 60)
  return soloDigitos(String(min * 1000 + (totalSeg % 60) * 10 + d))
}
