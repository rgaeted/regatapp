import { describe, expect, it } from 'vitest'
import { armarSesionInput, estadoInicial, type EstadoFormulario } from '@/lib/sesion/formulario'

const ATLETA = '22222222-2222-4222-8222-222222222222'
const ID = '11111111-1111-4111-8111-111111111111'

function estado(extra: Partial<EstadoFormulario> = {}): EstadoFormulario {
  return {
    ...estadoInicial(ID, ATLETA, new Date('2026-10-20T14:30:00Z')),
    distancia: '2000',
    tiempoDigitos: '7355',
    ...extra,
  }
}

const ocho = (tiempos: string[]) => ({ nSplits: 8, splitsDigitos: tiempos })

describe('armarSesionInput', () => {
  it('2000 m, 7:35.5 y 8 splits: reparte distancias y numera desde 1', () => {
    const r = armarSesionInput(
      estado(ocho(['1539', '1540', '1541', '1542', '1539', '1540', '1541', '1542'])),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input.tiempo_ds).toBe(4555)
    expect(r.input.distancia_m).toBe(2000)
    expect(r.input.splits).toHaveLength(8)
    expect(r.input.splits.map((s) => s.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(r.input.splits.every((s) => s.distancia_m === 250)).toBe(true)
    expect(r.input.splits[0].tiempo_ds).toBe(1139)
  })

  it('splits todos vacíos: la sesión se guarda sin splits', () => {
    const r = armarSesionInput(estado(ocho(Array(8).fill(''))))
    expect(r.ok && r.input.splits).toEqual([])
  })

  it('splits a medias: error en splits', () => {
    const r = armarSesionInput(estado(ocho(['1539', '1540', '1541', '1542', '', '', '', ''])))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.splits).toBe('Faltan tiempos en splits')
  })

  it('sin tiempo total pero con splits: se guarda sin total', () => {
    const r = armarSesionInput(
      estado({ tiempoDigitos: '', nSplits: 2, splitsDigitos: ['21000', '21100'] }),
    )
    expect(r.ok && r.input.tiempo_ds).toBeUndefined()
  })

  it('segundos inválidos en el total: error en tiempo', () => {
    const r = armarSesionInput(estado({ tiempoDigitos: '1753' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.tiempo).toBe('Tiempo inválido')
  })

  it('segundos inválidos en un split: error en splits', () => {
    const r = armarSesionInput(estado({ nSplits: 1, splitsDigitos: ['1753'] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.splits).toBe('Tiempo inválido en un split')
  })

  it('SPM por split: se guarda cuando está y queda ausente cuando no', () => {
    const r = armarSesionInput(
      estado({ nSplits: 2, splitsDigitos: ['1539', '1540'], splitsSpm: ['28', ''] }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input.splits[0].spm).toBe(28)
    expect(r.input.splits[1].spm).toBeUndefined()
  })

  it('SPM inválido en un split: error en splits', () => {
    const r = armarSesionInput(estado({ nSplits: 1, splitsDigitos: ['1539'], splitsSpm: ['2.8.1'] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.splits).toBe('SPM inválido en un split')
  })

  it('sin atleta: error en atleta', () => {
    const r = armarSesionInput(estado({ atletaId: '' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.atleta).toBe('Elige un atleta')
  })

  it('campos secundarios vacíos quedan ausentes, no en cero', () => {
    const r = armarSesionInput(estado())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input.rpe).toBeUndefined()
    expect(r.input.spm_promedio).toBeUndefined()
    expect(r.input.notas).toBeUndefined()
  })

  it('convierte los campos secundarios a número', () => {
    const r = armarSesionInput(
      estado({ extras: { spm: '28.5', fcPromedio: '172', fcMaxima: '', calorias: '95', drag: '125', rpe: '7', descripcion: '', notas: ' bien ' } }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input).toMatchObject({ spm_promedio: 28.5, fc_promedio: 172, calorias: 95, factor_arrastre: 125, rpe: 7, notas: 'bien' })
  })

  it('distancia sin splits ni total es válida (solo se anota el tipo de trabajo)', () => {
    const r = armarSesionInput(estado({ distancia: '', tiempoDigitos: '' }))
    expect(r.ok).toBe(true)
  })
})
