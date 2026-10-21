import { describe, expect, it } from 'vitest'
import { compararLectura, parsearVerdad, resumir } from '@/lib/ocr/evaluar'
import type { LecturaOcr } from '@/lib/ocr/lectura'

const lectura = (extra: Partial<LecturaOcr> = {}): LecturaOcr => ({
  distancia_m: 2000, tiempo_ds: 4555, spm_promedio: null, fc_promedio: null, calorias: null, factor_arrastre: null,
  splits: [], confianza: { distancia_m: 1, tiempo_ds: 1, spm_promedio: 0, fc_promedio: 0, calorias: 0, factor_arrastre: 0, splits: 0 },
  ...extra,
})

describe('parsearVerdad', () => {
  it('lee archivo,distancia_m,tiempo y salta encabezado y líneas vacías', () => {
    const csv = 'archivo,distancia_m,tiempo\nfoto1.jpg,2000,7:35.5\n\nfoto2.jpg,500,1:45.2\n'
    expect(parsearVerdad(csv)).toEqual([
      { archivo: 'foto1.jpg', distancia_m: 2000, tiempo_ds: 4555 },
      { archivo: 'foto2.jpg', distancia_m: 500, tiempo_ds: 1052 },
    ])
  })
  it('rechaza una fila con tiempo inválido en vez de ignorarla', () => {
    expect(() => parsearVerdad('archivo,distancia_m,tiempo\nf.jpg,2000,2:75.3')).toThrow('f.jpg')
  })
})

describe('compararLectura', () => {
  const verdad = { archivo: 'a.jpg', distancia_m: 2000, tiempo_ds: 4555 }

  it('todo correcto', () => {
    expect(compararLectura(verdad, lectura())).toEqual({ distancia: true, tiempo: true, split: true })
  })
  it('un tiempo mal leído arrastra al split', () => {
    expect(compararLectura(verdad, lectura({ tiempo_ds: 4455 }))).toEqual({ distancia: true, tiempo: false, split: false })
  })
  it('una distancia mal leída falla distancia y split, no el tiempo', () => {
    expect(compararLectura(verdad, lectura({ distancia_m: 2500 }))).toEqual({ distancia: false, tiempo: true, split: false })
  })
  it('sin lectura (null) todo falla', () => {
    expect(compararLectura(verdad, null)).toEqual({ distancia: false, tiempo: false, split: false })
    expect(compararLectura(verdad, lectura({ distancia_m: null, tiempo_ds: null }))).toEqual({ distancia: false, tiempo: false, split: false })
  })
  it('el split /500 coincide aunque distancia y tiempo estén mal si se compensan (se compara el valor, no los datos)', () => {
    // 1000 m en 3:47.7 y 2000 m en 7:35.4 dan el mismo /500 redondeado a décimas
    expect(compararLectura({ archivo: 'b', distancia_m: 1000, tiempo_ds: 2277 }, lectura({ distancia_m: 2000, tiempo_ds: 4554 })).split).toBe(true)
  })
})

describe('resumir', () => {
  it('da el porcentaje por campo y el total de campos principales', () => {
    const r = resumir([
      { distancia: true, tiempo: true, split: true },
      { distancia: true, tiempo: false, split: false },
    ])
    expect(r.fotos).toBe(2)
    expect(r.porCampo).toEqual({ distancia: 1, tiempo: 0.5, split: 0.5 })
    expect(r.total).toBeCloseTo(4 / 6)
  })
  it('sin fotos no divide por cero', () => {
    expect(resumir([])).toEqual({ fotos: 0, porCampo: { distancia: 0, tiempo: 0, split: 0 }, total: 0 })
  })
})
