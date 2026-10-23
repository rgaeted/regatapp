import { describe, expect, it } from 'vitest'
import { digitosATiempo } from '@/lib/sesion/digitos'
import { estadoInicial } from '@/lib/sesion/formulario'
import {
  camposDudosos,
  huboCambios,
  lecturaAEstado,
  normalizarLectura,
  tiempoADigitos,
  type CrudaModelo,
} from '@/lib/ocr/lectura'

const confianzaAlta = {
  distancia_m: 0.98, tiempo: 0.95, spm_promedio: 0.9, fc_promedio: 0.9,
  calorias: 0.9, factor_arrastre: 0.9, splits: 0.9,
}

function cruda(extra: Partial<CrudaModelo> = {}): CrudaModelo {
  return {
    distancia_m: 2000, tiempo: '7:35.5', spm_promedio: 28.5, fc_promedio: 172,
    calorias: 95, factor_arrastre: 125,
    splits: [
      { orden: 1, distancia_m: 500, tiempo: '1:53.9', spm: 29, fc: 165 },
      { orden: 2, distancia_m: 500, tiempo: '1:54.1', spm: 28, fc: 170 },
    ],
    confianza: confianzaAlta,
    ...extra,
  }
}

describe('normalizarLectura', () => {
  it('convierte los tiempos mostrados a décimas', () => {
    const l = normalizarLectura(cruda())
    expect(l.tiempo_ds).toBe(4555)
    expect(l.splits.map((s) => s.tiempo_ds)).toEqual([1139, 1141])
    expect(l.confianza.tiempo_ds).toBe(0.95)
  })

  it('un tiempo inválido queda null y no se inventa', () => {
    expect(normalizarLectura(cruda({ tiempo: '2:75.3' })).tiempo_ds).toBeNull()
    expect(normalizarLectura(cruda({ tiempo: 'abc' })).tiempo_ds).toBeNull()
    expect(normalizarLectura(cruda({ tiempo: null })).tiempo_ds).toBeNull()
  })

  it('distancia no positiva es null, nunca cero', () => {
    expect(normalizarLectura(cruda({ distancia_m: 0 })).distancia_m).toBeNull()
    expect(normalizarLectura(cruda({ distancia_m: -5 })).distancia_m).toBeNull()
  })

  it('si un split tiene tiempo inválido se descartan todos los splits y su confianza baja a 0', () => {
    const l = normalizarLectura(
      cruda({ splits: [{ orden: 1, distancia_m: 500, tiempo: '1:53.9', spm: null, fc: null }, { orden: 2, distancia_m: 500, tiempo: '??', spm: null, fc: null }] }),
    )
    expect(l.splits).toEqual([])
    expect(l.confianza.splits).toBe(0)
  })

  it('los splits se renumeran desde 1 en orden', () => {
    const l = normalizarLectura(
      cruda({ splits: [{ orden: 7, distancia_m: 500, tiempo: '1:50.0', spm: null, fc: null }, { orden: 3, distancia_m: 500, tiempo: '1:51.0', spm: null, fc: null }] }),
    )
    expect(l.splits.map((s) => s.orden)).toEqual([1, 2])
    expect(l.splits.map((s) => s.tiempo_ds)).toEqual([1110, 1100])
  })

  it('recorta la confianza al rango 0–1', () => {
    const l = normalizarLectura(cruda({ confianza: { ...confianzaAlta, tiempo: 1.7, calorias: -0.2 } }))
    expect(l.confianza.tiempo_ds).toBe(1)
    expect(l.confianza.calorias).toBe(0)
  })

  it('una foto sin pantalla (todo null) da una lectura vacía', () => {
    const l = normalizarLectura(
      cruda({ distancia_m: null, tiempo: null, spm_promedio: null, fc_promedio: null, calorias: null, factor_arrastre: null, splits: [], confianza: { distancia_m: 0, tiempo: 0, spm_promedio: 0, fc_promedio: 0, calorias: 0, factor_arrastre: 0, splits: 0 } }),
    )
    expect(l.distancia_m).toBeNull()
    expect(l.tiempo_ds).toBeNull()
    expect(l.splits).toEqual([])
  })
})

describe('camposDudosos', () => {
  it('marca los de confianza < 0.85', () => {
    const l = normalizarLectura(cruda({ confianza: { ...confianzaAlta, fc_promedio: 0.4, spm_promedio: 0.8 } }))
    expect(camposDudosos(l)).toEqual(expect.arrayContaining(['fc_promedio', 'spm_promedio']))
    expect(camposDudosos(l)).not.toContain('tiempo_ds')
  })
  it('marca distancia y tiempo cuando no se pudieron leer', () => {
    const l = normalizarLectura(cruda({ distancia_m: null, tiempo: null }))
    expect(camposDudosos(l)).toEqual(expect.arrayContaining(['distancia_m', 'tiempo_ds']))
  })
  it('un campo opcional ausente con confianza alta no se marca', () => {
    const l = normalizarLectura(cruda({ calorias: null, confianza: { ...confianzaAlta, calorias: 0.95 } }))
    expect(camposDudosos(l)).not.toContain('calorias')
  })
})

describe('tiempoADigitos', () => {
  it.each([[5, '5'], [4555, '7355'], [623, '1023'], [42355, '70355'], [6203, '10203']])('%i → %s', (ds, d) => {
    expect(tiempoADigitos(ds)).toBe(d)
  })
  it('es la inversa de digitosATiempo', () => {
    for (const ds of [1, 59, 600, 1139, 36000, 123456]) {
      expect(digitosATiempo(tiempoADigitos(ds))).toBe(ds)
    }
  })
})

describe('lecturaAEstado / huboCambios', () => {
  const base = estadoInicial('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', new Date('2026-10-21T12:00:00Z'))

  it('precarga el formulario con lo leído', () => {
    const e = lecturaAEstado(normalizarLectura(cruda()), base)
    expect(e.distancia).toBe('2000')
    expect(e.tiempoDigitos).toBe('7355')
    expect(e.nSplits).toBe(2)
    expect(e.splitsDigitos).toEqual(['1539', '1541'])
    expect(e.extras).toMatchObject({ spm: '28.5', fcPromedio: '172', calorias: '95', drag: '125' })
  })

  it('lo no leído queda vacío', () => {
    const e = lecturaAEstado(normalizarLectura(cruda({ distancia_m: null, tiempo: null, fc_promedio: null, splits: [] })), base)
    expect(e.distancia).toBe('')
    expect(e.tiempoDigitos).toBe('')
    expect(e.nSplits).toBe(0)
    expect(e.extras.fcPromedio).toBe('')
  })

  it('huboCambios es falso si el estado sigue igual al leído y verdadero si se editó algo', () => {
    const leido = lecturaAEstado(normalizarLectura(cruda()), base)
    expect(huboCambios(leido, { ...leido })).toBe(false)
    expect(huboCambios(leido, { ...leido, tiempoDigitos: '7356' })).toBe(true)
    expect(huboCambios(leido, { ...leido, splitsDigitos: ['1539', '1542'] })).toBe(true)
    expect(huboCambios(leido, { ...leido, splitsSpm: ['31', '30'] })).toBe(true)
    expect(huboCambios(leido, { ...leido, extras: { ...leido.extras, rpe: '7' } })).toBe(true)
  })

  it('cambiar el atleta o la fecha no cuenta como corregir la lectura', () => {
    const leido = lecturaAEstado(normalizarLectura(cruda()), base)
    expect(huboCambios(leido, { ...leido, atletaId: 'otro', dia: '2026-10-20', tipo: 'test' })).toBe(false)
  })
})
