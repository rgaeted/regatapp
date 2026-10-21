/**
 * Datos de ejemplo para probar la app (récords, curvas, volumen) sin datos
 * reales. Todo lleva "PRUEBA" en el apellido o en las notas para encontrarlo y
 * borrarlo. Sin `server-only`: lo usa el script `npm run datos-prueba` y vitest.
 */

export type PerfilPrueba = {
  /** Tiempo de 2 km al inicio, en décimas, y cuánto mejora hacia el final. */
  base2k: number
  mejora2k: number
  base500: number
  base5k: number
  base6k: number
  base10kAgua: number
  nTests2k: number
}

export type SesionPrueba = {
  sesion: {
    tipo: 'entrenamiento' | 'test' | 'competencia'
    modalidad: 'ergometro' | 'agua'
    fecha: string
    distancia_m: number
    tiempo_ds: number
    spm_promedio: number
    fc_promedio: number
    origen: 'manual' | 'ocr_foto'
    verificado: boolean
    notas: string
  }
  splits: { orden: number; distancia_m: number; tiempo_ds: number; spm: number }[]
}

export const ATLETAS_PRUEBA = [
  {
    nombre: 'Ana',
    apellido: 'PRUEBA Uno',
    fecha_nacimiento: '2010-05-01',
    sexo: 'F' as const,
    peso_kg: 55,
    altura_cm: 165,
    categoria_peso: 'ligero' as const,
    semilla: 11,
    perfil: { base2k: 5200, mejora2k: 300, base500: 1010, base5k: 13300, base6k: 16100, base10kAgua: 28200, nTests2k: 10 },
  },
  {
    nombre: 'Luis',
    apellido: 'PRUEBA Dos',
    fecha_nacimiento: '2008-03-12',
    sexo: 'M' as const,
    peso_kg: 72,
    altura_cm: 178,
    categoria_peso: 'abierto' as const,
    semilla: 22,
    perfil: { base2k: 4420, mejora2k: 170, base500: 905, base5k: 11400, base6k: 13700, base10kAgua: 24100, nTests2k: 8 },
  },
]

const NOTA = 'PRUEBA: dato de ejemplo'

/** Generador pseudoaleatorio con semilla (mulberry32): mismos datos en cada corrida. */
function aleatorio(semilla: number): () => number {
  let a = semilla
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Reparte `total` en 4 parciales de 500 m (los primeros un poco más rápidos), sumando exacto. */
function cuatroSplits(total: number, rnd: () => number): SesionPrueba['splits'] {
  const media = total / 4
  const sesgo = [-0.012, -0.004, 0.006, 0.01]
  const partes = sesgo.slice(0, 3).map((s) => Math.round(media * (1 + s + (rnd() - 0.5) * 0.008)))
  partes.push(total - partes.reduce((a, b) => a + b, 0))
  const spm = [30, 29, 29, 31]
  return partes.map((t, i) => ({ orden: i + 1, distancia_m: 500, tiempo_ds: t, spm: spm[i] }))
}

export function generarSesionesPrueba(semilla: number, p: PerfilPrueba, ahora: Date): SesionPrueba[] {
  const rnd = aleatorio(semilla)
  const ruido = (amplitud: number) => Math.round((rnd() - 0.5) * 2 * amplitud)
  // A las 20:00 UTC (≈ 17:00 en Santiago), `dias` antes de hoy.
  const fecha = (dias: number) => {
    const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - dias, 20))
    return d.toISOString()
  }
  const salida: SesionPrueba[] = []
  const agregar = (
    tipo: SesionPrueba['sesion']['tipo'],
    modalidad: SesionPrueba['sesion']['modalidad'],
    dias: number,
    distancia_m: number,
    tiempo_ds: number,
    opciones: { splits?: boolean; verificado?: boolean; origen?: 'manual' | 'ocr_foto' } = {},
  ) => {
    salida.push({
      sesion: {
        tipo, modalidad, fecha: fecha(dias), distancia_m, tiempo_ds,
        spm_promedio: 20 + Math.round(rnd() * 100) / 10,
        fc_promedio: 150 + Math.round(rnd() * 25),
        origen: opciones.origen ?? 'manual',
        verificado: opciones.verificado ?? true,
        notas: NOTA,
      },
      splits: opciones.splits ? cuatroSplits(tiempo_ds, rnd) : [],
    })
  }

  // Tests de 2 km cada 12 días, mejorando con algo de ruido.
  const n = p.nTests2k
  let mejor = Infinity
  for (let i = 0; i < n; i++) {
    const t = Math.round(p.base2k - p.mejora2k * (i / (n - 1))) + ruido(12)
    mejor = Math.min(mejor, t)
    agregar('test', 'ergometro', 140 - i * 12, 2000, t, { splits: true })
  }
  // Una regata en ergómetro, un poco mejor que el mejor test.
  agregar('competencia', 'ergometro', 12, 2000, mejor - 25, { splits: true })
  // 500 m.
  ;[110, 70, 25].forEach((d, i) => agregar('test', 'ergometro', d, 500, p.base500 - i * 12 + ruido(4)))
  // Entrenamientos largos en ergómetro.
  for (let i = 0; i < 6; i++) agregar('entrenamiento', 'ergometro', 132 - i * 22, 5000, Math.round(p.base5k * (1 - i * 0.005)) + ruido(40))
  for (let i = 0; i < 5; i++) agregar('entrenamiento', 'ergometro', 120 - i * 24, 6000, Math.round(p.base6k * (1 - i * 0.005)) + ruido(50))
  // Salidas en agua: suman volumen, no entran en récords.
  ;[60, 18].forEach((d) => agregar('entrenamiento', 'agua', d, 10000, p.base10kAgua + ruido(300)))
  // Lecturas de foto sin confirmar: una marca absurda que NO debe ser récord.
  agregar('test', 'ergometro', 3, 2000, Math.round(p.base2k * 0.88), { verificado: false, origen: 'ocr_foto' })
  agregar('entrenamiento', 'ergometro', 1, 6000, Math.round(p.base6k * 0.9), { verificado: false, origen: 'ocr_foto' })

  return salida.sort((a, b) => a.sesion.fecha.localeCompare(b.sesion.fecha))
}
