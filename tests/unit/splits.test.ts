import { describe, expect, it } from 'vitest'
import { diferenciaSuma, repartirSplits } from '@/lib/sesion/splits'

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('repartirSplits', () => {
  it('reparte en partes iguales', () => {
    expect(repartirSplits(2000, 8)).toEqual(Array(8).fill(250))
  })
  it('el último absorbe el resto', () => {
    expect(repartirSplits(2000, 3)).toEqual([666, 666, 668])
  })
  it('la suma siempre es la distancia total', () => {
    expect(suma(repartirSplits(1500, 4))).toBe(1500)
    expect(suma(repartirSplits(2001, 7))).toBe(2001)
  })
  it('n o distancia inválidos dan arreglo vacío', () => {
    expect(repartirSplits(2000, 0)).toEqual([])
    expect(repartirSplits(0, 4)).toEqual([])
  })
})

describe('diferenciaSuma', () => {
  it('es 0 cuando coincide', () => {
    expect(diferenciaSuma([100, 100], 200)).toBe(0)
  })
  it('es suma menos total', () => {
    expect(diferenciaSuma([100, 101], 200)).toBe(1)
    expect(diferenciaSuma([100, 90], 200)).toBe(-10)
  })
})
