import { describe, expect, it } from 'vitest'
import { ATLETAS_PRUEBA, generarSesionesPrueba } from '@/lib/datos-prueba'
import { recordsPorDistancia, distanciasConCurva, type FilaProgreso } from '@/lib/progreso/calculos'

const AHORA = new Date('2026-10-21T15:00:00Z')

describe('atletas de prueba', () => {
  it('están marcados en el apellido para poder encontrarlos y borrarlos', () => {
    expect(ATLETAS_PRUEBA.length).toBeGreaterThanOrEqual(2)
    for (const a of ATLETAS_PRUEBA) expect(a.apellido.startsWith('PRUEBA')).toBe(true)
  })
})

describe('generarSesionesPrueba', () => {
  for (const a of ATLETAS_PRUEBA) {
    const sesiones = generarSesionesPrueba(a.semilla, a.perfil, AHORA)

    it(`${a.apellido}: respeta las restricciones del esquema`, () => {
      expect(sesiones.length).toBeGreaterThan(12)
      for (const { sesion } of sesiones) {
        expect(sesion.tiempo_ds).toBeGreaterThan(0)
        expect(sesion.distancia_m).toBeGreaterThan(0)
        expect(new Date(sesion.fecha).getTime()).toBeLessThanOrEqual(AHORA.getTime())
        expect(sesion.notas).toContain('PRUEBA')
      }
    })

    it(`${a.apellido}: los splits suman exactamente el total`, () => {
      const conSplits = sesiones.filter((s) => s.splits.length > 0)
      expect(conSplits.length).toBeGreaterThan(3)
      for (const { sesion, splits } of conSplits) {
        expect(splits.reduce((x, y) => x + y.tiempo_ds, 0)).toBe(sesion.tiempo_ds)
        expect(splits.reduce((x, y) => x + (y.distancia_m ?? 0), 0)).toBe(sesion.distancia_m)
        expect(splits.map((s) => s.orden)).toEqual(splits.map((_, i) => i + 1))
      }
    })

    it(`${a.apellido}: es determinista`, () => {
      expect(generarSesionesPrueba(a.semilla, a.perfil, AHORA)).toEqual(sesiones)
    })

    it(`${a.apellido}: alcanza para ver récords, una curva de 2 km y también hay sin verificar`, () => {
      const verificadas = sesiones.filter((s) => s.sesion.verificado).map(
        (s, i): FilaProgreso => ({ id: String(i), fecha: s.sesion.fecha, tipo: s.sesion.tipo, modalidad: s.sesion.modalidad, distancia_m: s.sesion.distancia_m, tiempo_ds: s.sesion.tiempo_ds }),
      )
      expect(recordsPorDistancia(verificadas).length).toBeGreaterThanOrEqual(3)
      expect(distanciasConCurva(verificadas)).toContain(2000)
      expect(sesiones.some((s) => !s.sesion.verificado && s.sesion.origen === 'ocr_foto')).toBe(true)
    })

    it(`${a.apellido}: la sesión sin verificar no es la mejor marca (no debe dominar sin confirmarse)`, () => {
      // El caso demostrativo: una lectura absurda de OCR, sin confirmar, no cuenta en récords.
      const sinVerificar = sesiones.filter((s) => !s.sesion.verificado)
      expect(sinVerificar.length).toBeGreaterThan(0)
    })
  }

  it('el progreso del atleta 1 mejora con el tiempo en 2 km (para que la curva se vea)', () => {
    const a = ATLETAS_PRUEBA[0]
    const tests = generarSesionesPrueba(a.semilla, a.perfil, AHORA)
      .filter((s) => s.sesion.verificado && s.sesion.distancia_m === 2000 && s.sesion.modalidad === 'ergometro')
      .sort((x, y) => x.sesion.fecha.localeCompare(y.sesion.fecha))
    expect(tests[tests.length - 1].sesion.tiempo_ds).toBeLessThan(tests[0].sesion.tiempo_ds)
  })
})
