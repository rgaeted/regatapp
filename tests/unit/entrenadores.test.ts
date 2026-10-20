import { describe, expect, it } from 'vitest'
import { diaAnterior } from '@/lib/atletas/entrenadores'

describe('diaAnterior', () => {
  it('resta un día civil', () => {
    expect(diaAnterior('2026-10-20')).toBe('2026-10-19')
  })
  it('cruza mes y año', () => {
    expect(diaAnterior('2026-11-01')).toBe('2026-10-31')
    expect(diaAnterior('2026-01-01')).toBe('2025-12-31')
  })
  it('respeta el 29 de febrero', () => {
    expect(diaAnterior('2028-03-01')).toBe('2028-02-29')
  })
})
