/** Tiempos en décimas de segundo (enteros). Ver AGENTS.md §3. */

const SOLO_DIGITOS = /^\d+$/
const SEG_D = /^(\d{1,2})\.(\d)$/
const MIN_SEG = /^(\d+):(\d{1,2})(?:\.(\d))?$/
const HORA_MIN_SEG = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d))?$/

function positivo(ds: number): number | null {
  return ds > 0 ? ds : null
}

export function parseTiempo(texto: string): number | null {
  const t = texto.trim()
  if (t === '') return null

  if (SOLO_DIGITOS.test(t)) {
    const d = Number(t.slice(-1))
    const seg = t.length > 1 ? Number(t.slice(-3, -1)) : 0
    const min = t.length > 3 ? Number(t.slice(0, -3)) : 0
    if (seg >= 60) return null
    return positivo((min * 60 + seg) * 10 + d)
  }

  const sd = SEG_D.exec(t)
  if (sd) {
    const seg = Number(sd[1])
    if (seg >= 60) return null
    return positivo(seg * 10 + Number(sd[2]))
  }

  const hms = HORA_MIN_SEG.exec(t)
  if (hms) {
    const h = Number(hms[1])
    const min = Number(hms[2])
    const seg = Number(hms[3])
    if (min >= 60 || seg >= 60) return null
    return positivo(((h * 60 + min) * 60 + seg) * 10 + Number(hms[4] ?? 0))
  }

  const ms = MIN_SEG.exec(t)
  if (ms) {
    const min = Number(ms[1])
    const seg = Number(ms[2])
    if (seg >= 60) return null
    return positivo((min * 60 + seg) * 10 + Number(ms[3] ?? 0))
  }

  return null
}

export function formatTiempo(ds: number): string {
  const d = ds % 10
  const totalSeg = Math.floor(ds / 10)
  const seg = totalSeg % 60
  const totalMin = Math.floor(totalSeg / 60)
  const dos = (n: number) => String(n).padStart(2, '0')
  if (ds < 600) return `${seg}.${d}`
  if (ds < 36000) return `${totalMin}:${dos(seg)}.${d}`
  return `${Math.floor(totalMin / 60)}:${dos(totalMin % 60)}:${dos(seg)}.${d}`
}

/** Décimas por 500 m, redondeado al entero. */
export function split500(tiempo_ds: number, distancia_m: number): number {
  return Math.round((tiempo_ds * 500) / distancia_m)
}

/** Fórmula Concept2: watts = 2.80 / pace³, pace en s/m. */
export function watts(tiempo_ds: number, distancia_m: number): number {
  const pace = tiempo_ds / 10 / distancia_m
  return Math.round(2.8 / pace ** 3)
}
