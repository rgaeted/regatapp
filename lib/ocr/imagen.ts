import type { TipoImagen } from './leer'

/** Tamaño de salida para un lado mayor máximo; no agranda. */
export function escalarA(ancho: number, alto: number, ladoMayor: number): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto)
  if (mayor <= ladoMayor) return { ancho, alto }
  const f = ladoMayor / mayor
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)) }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const EXTENSIONES: Record<string, TipoImagen> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/**
 * La ruta en Storage debe ser exactamente `<uid>/<uuid>.<ext>` del usuario que
 * llama (la misma regla del bucket y de la política de `captura`): sin
 * subcarpetas, sin `..` y con una extensión de imagen admitida.
 */
export function rutaCapturaValida(ruta: string, usuarioId: string): boolean {
  const m = new RegExp(`^(${UUID})/${UUID}\.(jpg|jpeg|png|webp)$`, 'i').exec(ruta)
  return m !== null && m[1].toLowerCase() === usuarioId.toLowerCase()
}

export function tipoDeRuta(ruta: string): TipoImagen {
  const ext = ruta.slice(ruta.lastIndexOf('.') + 1).toLowerCase()
  return EXTENSIONES[ext] ?? 'image/jpeg'
}
