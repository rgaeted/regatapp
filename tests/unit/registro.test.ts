import { describe, expect, it } from 'vitest'
import { TOPE_CUENTAS_POR_HORA, superaTope, validarRegistro } from '@/lib/acceso/registro'

describe('validarRegistro', () => {
  const valido = { nombre: 'Ana Pérez', usuario: 'Ana.Perez', clave: 'una-clave-larga' }

  it('normaliza el usuario y recorta el nombre', () => {
    const r = validarRegistro({ ...valido, nombre: '  Ana Pérez  ' })
    expect(r).toEqual({ ok: true, datos: { nombre: 'Ana Pérez', usuario: 'ana.perez', clave: 'una-clave-larga' } })
  })

  it('el nombre es obligatorio y razonable', () => {
    expect(validarRegistro({ ...valido, nombre: '  ' })).toMatchObject({ ok: false, errores: { nombre: expect.any(String) } })
    expect(validarRegistro({ ...valido, nombre: 'x'.repeat(61) })).toMatchObject({ ok: false, errores: { nombre: expect.any(String) } })
  })

  it('el usuario debe tener un formato válido y el mensaje explica cuál', () => {
    const r = validarRegistro({ ...valido, usuario: 'a b' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.usuario).toContain('3 a 32')
  })

  it('la contraseña pide al menos 8 caracteres', () => {
    const r = validarRegistro({ ...valido, clave: 'corta' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.clave).toContain('8')
  })

  it('junta todos los errores a la vez', () => {
    const r = validarRegistro({ nombre: '', usuario: '!', clave: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(['clave', 'nombre', 'usuario'])
  })

  it('el nombre no puede parecerse a una instrucción HTML (se guarda como texto, pero se rechaza lo evidente)', () => {
    expect(validarRegistro({ ...valido, nombre: '<script>alert(1)</script>' }).ok).toBe(false)
  })
})

describe('tope de cuentas nuevas por hora', () => {
  it('se supera al llegar al tope', () => {
    expect(superaTope(TOPE_CUENTAS_POR_HORA - 1)).toBe(false)
    expect(superaTope(TOPE_CUENTAS_POR_HORA)).toBe(true)
  })
})
