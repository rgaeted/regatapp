import { describe, expect, it } from 'vitest'
import { evaluarCuenta } from '@/lib/acceso/enlace'

const base = { nombre: 'Ana', usuario: 'ana', atleta_id: 'a1' }
const consent = (...revocados: (string | null)[]) => revocados.map((r) => ({ revocado_en: r }))

describe('evaluarCuenta (la regla de acceso sobre una sola fila)', () => {
  it('el staff siempre tiene acceso, con o sin atleta', () => {
    expect(evaluarCuenta({ ...base, rol: 'entrenador', atleta_id: null, atleta: null })).toMatchObject({ tieneAcceso: true })
    expect(evaluarCuenta({ ...base, rol: 'admin', atleta_id: null, atleta: null })).toMatchObject({ tieneAcceso: true })
  })

  it('un remero con atleta activo y consentimiento vigente tiene acceso', () => {
    const r = evaluarCuenta({ ...base, rol: 'remero', atleta: { activo: true, consentimiento: consent(null) } })
    expect(r.tieneAcceso).toBe(true)
    expect(r.perfil).toEqual({ rol: 'remero', nombre: 'Ana', atleta_id: 'a1', usuario: 'ana' })
  })

  it('basta un consentimiento sin revocar aunque haya otros revocados', () => {
    const r = evaluarCuenta({ ...base, rol: 'remero', atleta: { activo: true, consentimiento: consent('2026-01-01T00:00:00Z', null) } })
    expect(r.tieneAcceso).toBe(true)
  })

  it('con todos los consentimientos revocados, o ninguno, no tiene acceso', () => {
    expect(evaluarCuenta({ ...base, rol: 'remero', atleta: { activo: true, consentimiento: consent('2026-01-01T00:00:00Z') } }).tieneAcceso).toBe(false)
    expect(evaluarCuenta({ ...base, rol: 'remero', atleta: { activo: true, consentimiento: [] } }).tieneAcceso).toBe(false)
  })

  it('con el atleta inactivo no tiene acceso', () => {
    expect(evaluarCuenta({ ...base, rol: 'remero', atleta: { activo: false, consentimiento: consent(null) } }).tieneAcceso).toBe(false)
  })

  it('un remero sin atleta (cuenta pendiente) no tiene acceso, pero se reconoce su perfil', () => {
    const r = evaluarCuenta({ ...base, rol: 'remero', atleta_id: null, atleta: null })
    expect(r.tieneAcceso).toBe(false)
    expect(r.perfil.atleta_id).toBeNull()
  })

  it('una fila con forma inesperada lanza en vez de dar acceso', () => {
    expect(() => evaluarCuenta({ rol: 'dios', nombre: 'x' })).toThrow()
  })
})
