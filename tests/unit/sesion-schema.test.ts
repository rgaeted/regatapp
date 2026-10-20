import { describe, expect, it } from 'vitest'
import { sesionInputSchema } from '@/lib/schemas/sesion'

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  atleta_id: '22222222-2222-4222-8222-222222222222',
  tipo: 'entrenamiento',
  fecha: '2026-10-20T14:30:00.000Z',
  splits: [],
}

describe('sesionInputSchema', () => {
  it('acepta la sesión mínima y pone modalidad ergometro', () => {
    const r = sesionInputSchema.safeParse(base)
    expect(r.success).toBe(true)
    expect(r.success && r.data.modalidad).toBe('ergometro')
  })
  it('rechaza tiempo_ds 0, rpe 11 y fecha no ISO', () => {
    expect(sesionInputSchema.safeParse({ ...base, tiempo_ds: 0 }).success).toBe(false)
    expect(sesionInputSchema.safeParse({ ...base, rpe: 11 }).success).toBe(false)
    expect(sesionInputSchema.safeParse({ ...base, fecha: 'ayer' }).success).toBe(false)
  })
  it('rechaza orden repetido en splits', () => {
    const splits = [
      { orden: 1, tiempo_ds: 1000 },
      { orden: 1, tiempo_ds: 1010 },
    ]
    expect(sesionInputSchema.safeParse({ ...base, splits }).success).toBe(false)
  })
  it('rechaza un split sin tiempo (no hay splits a medias)', () => {
    const splits = [{ orden: 1, tiempo_ds: 1000 }, { orden: 2 }]
    expect(sesionInputSchema.safeParse({ ...base, splits }).success).toBe(false)
  })
})
