import { parseTiempo, split500 } from '@/lib/tiempo'
import type { LecturaOcr } from './lectura'

export type Verdad = { archivo: string; distancia_m: number; tiempo_ds: number }
export type Aciertos = { distancia: boolean; tiempo: boolean; split: boolean }

/**
 * Verdad conocida de cada foto, en CSV `archivo,distancia_m,tiempo` con el
 * tiempo como se ve en pantalla. Una fila inválida es un error, no se salta:
 * una verdad mal escrita falsearía el porcentaje.
 */
export function parsearVerdad(csv: string): Verdad[] {
  const filas = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  const datos = filas[0]?.toLowerCase().startsWith('archivo') ? filas.slice(1) : filas
  return datos.map((linea) => {
    const [archivo, distancia, tiempo] = linea.split(',').map((c) => c.trim())
    const d = Number(distancia)
    const t = parseTiempo(tiempo ?? '')
    if (!archivo || !Number.isInteger(d) || d <= 0 || t === null) {
      throw new Error(`Fila inválida en la verdad (${archivo || linea}): se espera archivo,distancia_m,tiempo`)
    }
    return { archivo, distancia_m: d, tiempo_ds: t }
  })
}

/**
 * Compara una lectura con la verdad. El "split" es el /500 que sale de
 * distancia y tiempo (como la vista `v_sesion_calculada`): acierta si el valor
 * coincide, aunque dos errores se compensen.
 */
export function compararLectura(verdad: Verdad, lectura: LecturaOcr | null): Aciertos {
  const distancia = lectura?.distancia_m === verdad.distancia_m
  const tiempo = lectura?.tiempo_ds === verdad.tiempo_ds
  const split =
    lectura?.distancia_m != null &&
    lectura.tiempo_ds != null &&
    split500(lectura.tiempo_ds, lectura.distancia_m) === split500(verdad.tiempo_ds, verdad.distancia_m)
  return { distancia, tiempo, split }
}

export function resumir(resultados: Aciertos[]): {
  fotos: number
  porCampo: Record<keyof Aciertos, number>
  total: number
} {
  const n = resultados.length
  if (n === 0) return { fotos: 0, porCampo: { distancia: 0, tiempo: 0, split: 0 }, total: 0 }
  const frac = (c: keyof Aciertos) => resultados.filter((r) => r[c]).length / n
  const porCampo = { distancia: frac('distancia'), tiempo: frac('tiempo'), split: frac('split') }
  return { fotos: n, porCampo, total: (porCampo.distancia + porCampo.tiempo + porCampo.split) / 3 }
}
