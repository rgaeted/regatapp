import { describe, expect, it } from 'vitest'
import { correoStaff, normalizarUsuario, validarClave } from '@/lib/acceso/clave'

describe('normalizarUsuario', () => {
  it('pasa a minúsculas y recorta', () => {
    expect(normalizarUsuario('  RGaete ')).toBe('rgaete')
  })
  it('acepta letras, números, punto, guion y guion bajo', () => {
    expect(normalizarUsuario('ana.perez_2-b')).toBe('ana.perez_2-b')
  })
  it.each(['', 'ab', 'a b', 'ñandu', 'a@b', 'x'.repeat(33), 'a/b'])('rechaza %j', (u) => {
    expect(normalizarUsuario(u)).toBeNull()
  })
})

describe('correoStaff', () => {
  it('deriva un correo sintético en un dominio distinto al de los remeros', () => {
    expect(correoStaff('rgaete')).toBe('rgaete@staff.regatapp.invalid')
    expect(correoStaff('rgaete')).not.toContain('remeros.invalid')
  })
})

describe('validarClave', () => {
  it('exige al menos 8 caracteres', () => {
    expect(validarClave('Maca1987#')).toBe(true)
    expect(validarClave('corta1')).toBe(false)
    expect(validarClave('')).toBe(false)
  })
  it('rechaza claves de solo espacios', () => {
    expect(validarClave('        ')).toBe(false)
  })
  it('no recorta: los espacios cuentan como parte de la clave', () => {
    expect(validarClave(' abcdefg ')).toBe(true)
  })
})
