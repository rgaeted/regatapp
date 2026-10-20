import { describe, expect, it } from 'vitest'
import { formatTiempo, parseTiempo, split500, watts } from '@/lib/tiempo'

describe('parseTiempo', () => {
  it.each([
    ['5', 5], ['123', 123], ['1023', 623], ['7035', 4235],
    ['10203', 6203], ['70355', 42355],
    ['1:02.3', 623], ['7:03', 4230], ['1:10:35.5', 42355], ['  1:02.3 ', 623],
  ])('%s → %i', (t, ds) => expect(parseTiempo(t)).toBe(ds))
  it.each(['', '   ', 'abc', '0', '1753', '1:75.3', '1:60:00.0', '1:02.3.4'])(
    '%j → null', (t) => expect(parseTiempo(t)).toBeNull())
})
describe('formatTiempo', () => {
  it.each([[5, '0.5'], [123, '12.3'], [623, '1:02.3'], [4235, '7:03.5'],
           [6203, '10:20.3'], [42355, '1:10:35.5']])(
    '%i → %s', (ds, t) => expect(formatTiempo(ds)).toBe(t))
  it('ida y vuelta', () => { for (const ds of [1, 599, 600, 35999, 36000, 42355])
    expect(parseTiempo(formatTiempo(ds))).toBe(ds) })
})
describe('split500 y watts', () => {
  it('2000 m en 7:00.0', () => { expect(split500(4200, 2000)).toBe(1050); expect(watts(4200, 2000)).toBe(302) })
  it('500 m en 1:30.0',  () => { expect(split500(900, 500)).toBe(900);   expect(watts(900, 500)).toBe(480) })
})
