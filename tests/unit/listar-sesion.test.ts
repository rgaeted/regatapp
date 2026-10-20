import { describe, expect, it } from 'vitest'
import { filaSesion } from '@/lib/sesion/listar'

const base = {
  id: 'a',
  fecha: '2026-10-20T14:30:00+00:00',
  tipo: 'test',
  distancia_m: 2000,
  tiempo_ds: 4555,
  split_500_seg: 113.9,
  watts: 207,
  verificado: true,
  origen: 'manual',
}

describe('filaSesion', () => {
  it('formatea tiempo y split /500 con formatTiempo', () => {
    const f = filaSesion(base)
    expect(f.tiempo).toBe('7:35.5')
    expect(f.split500).toBe('1:53.9')
    expect(f.watts).toBe(207)
    expect(f.verificado).toBe(true)
  })

  it('sin tiempo o sin distancia muestra guion y no inventa watts', () => {
    const f = filaSesion({ ...base, tiempo_ds: null, split_500_seg: null, watts: null })
    expect(f.tiempo).toBe('—')
    expect(f.split500).toBe('—')
    expect(f.watts).toBeNull()
  })

  it('conserva verificado = false para mostrar el indicador', () => {
    expect(filaSesion({ ...base, verificado: false, origen: 'ocr_foto' }).verificado).toBe(false)
  })

  it('muestra la fecha en hora de Santiago', () => {
    // 14:30 UTC del 20 de octubre es 11:30 en Santiago (UTC-3, horario de verano).
    expect(filaSesion(base).fecha).toContain('11:30')
  })
})
