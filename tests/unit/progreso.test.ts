import { describe, expect, it } from 'vitest'
import {
  distanciasConCurva,
  recordsPorDistancia,
  resumenProgreso,
  serieSplit,
  ticksBonitos,
  volumenSemanal,
  type FilaProgreso,
} from '@/lib/progreso/calculos'

let n = 0
const f = (o: Partial<FilaProgreso> = {}): FilaProgreso => ({
  id: `s${++n}`,
  fecha: '2026-10-05T15:00:00Z',
  tipo: 'test',
  modalidad: 'ergometro',
  distancia_m: 2000,
  tiempo_ds: 4555,
  ...o,
})

describe('recordsPorDistancia', () => {
  it('toma el mejor tiempo de cada distancia, con split y watts derivados', () => {
    const r = recordsPorDistancia([
      f({ id: 'a', tiempo_ds: 4600, fecha: '2026-09-01T15:00:00Z' }),
      f({ id: 'b', tiempo_ds: 4555, fecha: '2026-10-01T15:00:00Z' }),
      f({ id: 'c', distancia_m: 500, tiempo_ds: 1052 }),
    ])
    expect(r.map((x) => x.distancia_m)).toEqual([500, 2000])
    const k2 = r.find((x) => x.distancia_m === 2000)!
    expect(k2).toMatchObject({ tiempo_ds: 4555, split500_ds: 1139, watts: 237, sesiones: 2, tipo: 'test' })
  })

  it('ignora agua y filas sin distancia o tiempo', () => {
    expect(
      recordsPorDistancia([
        f({ modalidad: 'agua' }),
        f({ distancia_m: null }),
        f({ tiempo_ds: null }),
        f({ modalidad: 'gimnasio' }),
      ]),
    ).toEqual([])
  })

  it('en un empate gana el más antiguo', () => {
    const r = recordsPorDistancia([
      f({ id: 'nuevo', fecha: '2026-10-10T15:00:00Z' }),
      f({ id: 'viejo', fecha: '2026-09-10T15:00:00Z' }),
    ])
    expect(r[0].id).toBe('viejo')
  })

  it('sin sesiones da una lista vacía', () => {
    expect(recordsPorDistancia([])).toEqual([])
  })
})

describe('distanciasConCurva', () => {
  it('lista las distancias con 2 o más sesiones, la más frecuente primero', () => {
    const filas = [
      f({ distancia_m: 2000 }), f({ distancia_m: 2000 }),
      f({ distancia_m: 500 }), f({ distancia_m: 500 }), f({ distancia_m: 500 }),
      f({ distancia_m: 1000 }),
      f({ distancia_m: 5000, modalidad: 'agua' }), f({ distancia_m: 5000, modalidad: 'agua' }),
    ]
    expect(distanciasConCurva(filas)).toEqual([500, 2000])
  })
  it('una sola sesión por distancia no tiene curva', () => {
    expect(distanciasConCurva([f({ distancia_m: 2000 }), f({ distancia_m: 500 })])).toEqual([])
  })
})

describe('serieSplit', () => {
  it('ordena por fecha y marca los récords progresivos', () => {
    const s = serieSplit(
      [
        f({ id: 'c', fecha: '2026-10-03T15:00:00Z', tiempo_ds: 4500 }),
        f({ id: 'a', fecha: '2026-10-01T15:00:00Z', tiempo_ds: 4600 }),
        f({ id: 'b', fecha: '2026-10-02T15:00:00Z', tiempo_ds: 4650 }),
        f({ id: 'x', fecha: '2026-10-02T16:00:00Z', distancia_m: 500, tiempo_ds: 1000 }),
      ],
      2000,
    )
    expect(s.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(s.map((p) => p.esRecord)).toEqual([true, false, true])
    expect(s[0].split500_ds).toBe(1150)
  })
})

describe('volumenSemanal', () => {
  const ahora = new Date('2026-10-21T15:00:00Z') // miércoles; su semana empieza el lunes 19
  it('agrupa por semana lunes–domingo de Santiago, con huecos en 0', () => {
    const v = volumenSemanal(
      [
        f({ fecha: '2026-10-20T15:00:00Z', distancia_m: 6000 }),
        f({ fecha: '2026-10-21T10:00:00Z', distancia_m: 2000, modalidad: 'agua' }),
        f({ fecha: '2026-10-08T15:00:00Z', distancia_m: 5000 }),
      ],
      ahora,
      4,
    )
    expect(v).toEqual([
      { inicio: '2026-09-28', metros: 0 },
      { inicio: '2026-10-05', metros: 5000 },
      { inicio: '2026-10-12', metros: 0 },
      { inicio: '2026-10-19', metros: 8000 },
    ])
  })

  it('el domingo por la noche de Santiago cuenta en la semana que termina, no en la siguiente', () => {
    // 2026-10-19T02:00Z = domingo 18 a las 23:00 en Santiago (UTC-3)
    const v = volumenSemanal([f({ fecha: '2026-10-19T02:00:00Z', distancia_m: 4000 })], ahora, 2)
    expect(v).toEqual([
      { inicio: '2026-10-12', metros: 4000 },
      { inicio: '2026-10-19', metros: 0 },
    ])
  })

  it('ignora sesiones fuera de la ventana y sin distancia', () => {
    const v = volumenSemanal(
      [f({ fecha: '2026-01-01T15:00:00Z', distancia_m: 9000 }), f({ distancia_m: null })],
      ahora,
      2,
    )
    expect(v.every((s) => s.metros === 0)).toBe(true)
  })
})

describe('ticksBonitos', () => {
  it('da números redondos que cubren el rango', () => {
    expect(ticksBonitos(0, 2300, 4)).toEqual([0, 500, 1000, 1500, 2000, 2500])
    expect(ticksBonitos(1130, 1190, 3)).toEqual([1120, 1140, 1160, 1180, 1200])
  })
  it('un rango de un solo valor sigue dando ticks que lo incluyen', () => {
    const t = ticksBonitos(100, 100, 3)
    expect(t[0]).toBeLessThanOrEqual(100)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(100)
    expect(t.length).toBeGreaterThanOrEqual(2)
  })
})

describe('resumenProgreso', () => {
  it('sin sesiones verificadas no hay datos, pero se informa lo que quedó fuera', () => {
    expect(resumenProgreso([], 3)).toEqual({ hayDatos: false, sesiones: 0, metros: 0, sinVerificar: 3 })
  })
  it('suma sesiones y metros verificados', () => {
    expect(resumenProgreso([f({ distancia_m: 2000 }), f({ distancia_m: null })], 0)).toEqual({
      hayDatos: true,
      sesiones: 2,
      metros: 2000,
      sinVerificar: 0,
    })
  })
})
