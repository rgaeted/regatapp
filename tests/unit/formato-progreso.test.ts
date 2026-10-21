import { describe, expect, it } from 'vitest'
import { fechaCorta, fechaLarga, kilometros, nombreDistancia } from '@/lib/progreso/formato'

describe('kilometros', () => {
  it('usa coma decimal y un decimal', () => {
    expect(kilometros(8000)).toBe('8,0 km')
    expect(kilometros(12500)).toBe('12,5 km')
    expect(kilometros(0)).toBe('0 km')
  })
})

describe('fechas en hora de Santiago', () => {
  it('la fecha corta no cambia de día por la zona horaria', () => {
    // 2026-10-19T02:00Z es el domingo 18 a las 23:00 en Santiago
    expect(fechaCorta('2026-10-19T02:00:00Z')).toContain('18')
  })
  it('la larga incluye el año', () => {
    expect(fechaLarga('2026-10-20T15:00:00Z')).toContain('2026')
  })
  it('acepta un día civil YYYY-MM-DD (lunes de una semana)', () => {
    expect(fechaCorta('2026-10-19')).toContain('19')
  })
})

describe('nombreDistancia', () => {
  it('muestra metros, o km desde 1000 sin decimales sobrantes', () => {
    expect(nombreDistancia(500)).toBe('500 m')
    expect(nombreDistancia(2000)).toBe('2 km')
    expect(nombreDistancia(6000)).toBe('6 km')
    expect(nombreDistancia(1500)).toBe('1,5 km')
  })
})
