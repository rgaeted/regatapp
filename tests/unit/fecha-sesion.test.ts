import { describe, expect, it } from 'vitest'
import { armarSesionInput, estadoInicial, fechaDeSesion } from '@/lib/sesion/formulario'

const AHORA = new Date('2026-10-20T14:30:00Z')

describe('fechaDeSesion', () => {
  it('sin día elegido usa el instante actual', () => {
    expect(fechaDeSesion('', AHORA)).toBe('2026-10-20T14:30:00.000Z')
  })
  it('un día elegido queda a las 12:00 de Santiago (verano, UTC-3)', () => {
    expect(fechaDeSesion('2026-10-19', AHORA)).toBe('2026-10-19T15:00:00.000Z')
  })
  it('y en invierno (UTC-4)', () => {
    expect(fechaDeSesion('2026-07-01', AHORA)).toBe('2026-07-01T16:00:00.000Z')
  })
})

describe('armarSesionInput con día y modalidad', () => {
  const ID = '11111111-1111-4111-8111-111111111111'
  const ATLETA = '22222222-2222-4222-8222-222222222222'
  it('usa el día elegido y la modalidad', () => {
    const e = { ...estadoInicial(ID, ATLETA, AHORA), dia: '2026-10-19', modalidad: 'agua' as const }
    const r = armarSesionInput(e, AHORA)
    expect(r.ok && r.input.fecha).toBe('2026-10-19T15:00:00.000Z')
    expect(r.ok && r.input.modalidad).toBe('agua')
  })
  it('rechaza un día futuro', () => {
    const e = { ...estadoInicial(ID, ATLETA, AHORA), dia: '2026-10-21' }
    const r = armarSesionInput(e, AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.fecha).toBe('La fecha no puede ser futura')
  })
})
