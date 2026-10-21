import { hoySantiago } from '@/lib/schemas/consentimiento'
import { split500, watts } from '@/lib/tiempo'

/** Una sesión verificada, tal como sale de `v_sesion_calculada`. */
export type FilaProgreso = {
  id: string
  fecha: string
  tipo: string
  modalidad: string
  distancia_m: number | null
  tiempo_ds: number | null
}

export type RecordPersonal = {
  id: string
  distancia_m: number
  tiempo_ds: number
  split500_ds: number
  watts: number
  fecha: string
  tipo: string
  /** Cuántas sesiones verificadas hay en esta distancia. */
  sesiones: number
}

export type PuntoSplit = {
  id: string
  fecha: string
  tiempo_ds: number
  split500_ds: number
  /** Mejor marca hasta ese día (estrictamente más rápida que todas las anteriores). */
  esRecord: boolean
}

export type SemanaVolumen = { inicio: string; metros: number }

type FilaErg = FilaProgreso & { distancia_m: number; tiempo_ds: number }

/** Solo el ergómetro es comparable entre sesiones; el agua depende de viento y corriente. */
function esErgometro(f: FilaProgreso): f is FilaErg {
  return f.modalidad === 'ergometro' && (f.distancia_m ?? 0) > 0 && (f.tiempo_ds ?? 0) > 0
}

/** Mejor marca por distancia (ergómetro). Ante un empate gana la más antigua. */
export function recordsPorDistancia(filas: FilaProgreso[]): RecordPersonal[] {
  const porDistancia = new Map<number, FilaErg[]>()
  for (const f of filas.filter(esErgometro)) {
    porDistancia.set(f.distancia_m, [...(porDistancia.get(f.distancia_m) ?? []), f])
  }
  return [...porDistancia.entries()]
    .map(([distancia_m, grupo]) => {
      const mejor = [...grupo].sort((a, b) => a.tiempo_ds - b.tiempo_ds || a.fecha.localeCompare(b.fecha))[0]
      return {
        id: mejor.id,
        distancia_m,
        tiempo_ds: mejor.tiempo_ds,
        split500_ds: split500(mejor.tiempo_ds, distancia_m),
        watts: watts(mejor.tiempo_ds, distancia_m),
        fecha: mejor.fecha,
        tipo: mejor.tipo,
        sesiones: grupo.length,
      }
    })
    .sort((a, b) => a.distancia_m - b.distancia_m)
}

/** Distancias con curva (2 o más sesiones de ergómetro), la más frecuente primero. */
export function distanciasConCurva(filas: FilaProgreso[]): number[] {
  const cuenta = new Map<number, number>()
  for (const f of filas.filter(esErgometro)) cuenta.set(f.distancia_m, (cuenta.get(f.distancia_m) ?? 0) + 1)
  return [...cuenta.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([d]) => d)
}

/** Split /500 en el tiempo para una distancia, con los récords progresivos marcados. */
export function serieSplit(filas: FilaProgreso[], distancia_m: number): PuntoSplit[] {
  const ordenadas = filas
    .filter(esErgometro)
    .filter((f) => f.distancia_m === distancia_m)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  let mejor = Infinity
  return ordenadas.map((f) => {
    const esRecord = f.tiempo_ds < mejor
    mejor = Math.min(mejor, f.tiempo_ds)
    return { id: f.id, fecha: f.fecha, tiempo_ds: f.tiempo_ds, split500_ds: split500(f.tiempo_ds, distancia_m), esRecord }
  })
}

/** Lunes de la semana de una fecha civil YYYY-MM-DD. */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * Metros por semana (lunes a domingo, hora de Santiago) de las últimas
 * `semanas` semanas, la actual incluida y al final. Todas las modalidades
 * cuentan; una semana sin sesiones aparece con 0.
 */
export function volumenSemanal(filas: FilaProgreso[], ahora: Date = new Date(), semanas = 12): SemanaVolumen[] {
  const actual = lunesDe(hoySantiago(ahora))
  const inicios: string[] = []
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(`${actual}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 7 * i)
    inicios.push(d.toISOString().slice(0, 10))
  }
  const metros = new Map(inicios.map((i) => [i, 0]))
  for (const f of filas) {
    if (!f.distancia_m || f.distancia_m <= 0) continue
    const semana = lunesDe(hoySantiago(new Date(f.fecha)))
    if (metros.has(semana)) metros.set(semana, (metros.get(semana) ?? 0) + f.distancia_m)
  }
  return inicios.map((inicio) => ({ inicio, metros: metros.get(inicio) ?? 0 }))
}

/** Ticks de eje con números redondos (1, 2 o 5 × 10^k) que cubren [min, max]. */
export function ticksBonitos(min: number, max: number, aproximados = 4): number[] {
  if (max <= min) {
    min -= 1
    max += 1
  }
  const bruto = (max - min) / aproximados
  const magnitud = 10 ** Math.floor(Math.log10(bruto))
  const norma = bruto / magnitud
  const paso = (norma >= 5 ? 5 : norma >= 2 ? 2 : 1) * magnitud
  const inicio = Math.floor(min / paso)
  const fin = Math.ceil(max / paso)
  const ticks: number[] = []
  for (let i = inicio; i <= fin; i++) ticks.push(Math.round(i * paso * 1e6) / 1e6)
  return ticks
}

export function resumenProgreso(filas: FilaProgreso[], sinVerificar: number) {
  return {
    hayDatos: filas.length > 0,
    sesiones: filas.length,
    metros: filas.reduce((a, f) => a + (f.distancia_m ?? 0), 0),
    sinVerificar,
  }
}
