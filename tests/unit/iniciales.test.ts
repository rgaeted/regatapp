import { describe, expect, it } from 'vitest'
import { iniciales } from '@/lib/atletas/iniciales'

describe('iniciales', () => {
  it('toma la inicial del nombre y la del apellido', () => {
    expect(iniciales('Ana', 'Pérez')).toBe('AP')
    expect(iniciales('Ana', 'PRUEBA Uno')).toBe('AP')
  })
  it('ignora espacios y pasa a mayúsculas, con tildes', () => {
    expect(iniciales('  luis ', ' álvarez')).toBe('LÁ')
  })
  it('un nombre completo en un solo campo usa la primera y la última palabra', () => {
    expect(iniciales('María José Soto', '')).toBe('MS')
  })
  it('sin datos devuelve un signo, nunca un texto vacío', () => {
    expect(iniciales('', '')).toBe('?')
    expect(iniciales('  ', '  ')).toBe('?')
  })
  it('una sola palabra da una sola inicial', () => {
    expect(iniciales('rgaete', '')).toBe('R')
  })
})
