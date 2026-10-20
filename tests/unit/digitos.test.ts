import { describe, expect, it } from 'vitest'
import {
  digitosATiempo,
  formatearDigitos,
  interpretarTiempoPegado,
  soloDigitos,
} from '@/lib/sesion/digitos'

describe('formatearDigitos (tabla del diseño §4)', () => {
  it.each([
    ['5', '0.5'],
    ['1023', '1:02.3'],
    ['7035', '7:03.5'],
    ['10203', '10:20.3'],
    ['70355', '1:10:35.5'],
    ['', ''],
  ])('%s → %s', (digitos, esperado) => {
    expect(formatearDigitos(digitos)).toBe(esperado)
  })

  it('muestra segundos inválidos tal cual para que el campo se marque', () => {
    expect(formatearDigitos('1753')).toBe('1:75.3')
  })
})

describe('digitosATiempo', () => {
  it('convierte a décimas', () => {
    expect(digitosATiempo('1023')).toBe(623)
    expect(digitosATiempo('70355')).toBe(42355)
  })
  it('es null con segundos ≥ 60 o vacío', () => {
    expect(digitosATiempo('1753')).toBeNull()
    expect(digitosATiempo('')).toBeNull()
  })
})

describe('soloDigitos', () => {
  it('quita no dígitos y ceros a la izquierda', () => {
    expect(soloDigitos('0012a3')).toBe('123')
  })
  it('limita a 7 dígitos', () => {
    expect(soloDigitos('12345678')).toBe('1234567')
  })
})

describe('interpretarTiempoPegado', () => {
  it('traduce m:ss.d a los dígitos que se habrían tipeado', () => {
    expect(interpretarTiempoPegado('2:07.3')).toBe('2073')
    expect(digitosATiempo('2073')).toBe(1273)
    expect(interpretarTiempoPegado('1:10:35.5')).toBe('70355')
  })
  it('texto sin separadores se trata como dígitos', () => {
    expect(interpretarTiempoPegado('1023')).toBe('1023')
  })
  it('texto inválido da cadena vacía', () => {
    expect(interpretarTiempoPegado('basura')).toBe('')
    expect(interpretarTiempoPegado('1:75.3')).toBe('')
  })
})
