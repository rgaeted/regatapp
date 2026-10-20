import { describe, expect, it } from 'vitest'
import { armarExportacion } from '@/lib/atletas/exportar'

const base = {
  atleta: { id: 'a1', nombre: 'Ana', apellido: 'Pérez' },
  sesiones: [
    { id: 's1', atleta_id: 'a1', captura_id: null },
    { id: 's2', atleta_id: 'a1', captura_id: 'c1' },
  ],
  splits: [
    { id: 'x3', sesion_id: 's1', orden: 2, tiempo_ds: 1100 },
    { id: 'x1', sesion_id: 's1', orden: 1, tiempo_ds: 1090 },
    { id: 'x2', sesion_id: 's2', orden: 1, tiempo_ds: 1200 },
  ],
  capturas: [
    { id: 'c1', storage_path: 'u/c1.jpg', foto_eliminada_en: '2026-10-21T00:00:00Z' },
    { id: 'c2', storage_path: 'u/c2.jpg', foto_eliminada_en: null },
  ],
  consentimientos: [{ id: 'k1', atleta_id: 'a1' }],
  registro_acceso: [{ id: 1, accion: 'ver_ficha' }],
}

describe('armarExportacion', () => {
  const r = armarExportacion(base, new Date('2026-10-22T12:00:00Z'))

  it('anida los splits bajo su sesión, ordenados por orden', () => {
    expect(r.sesiones[0].splits.map((s) => s.orden)).toEqual([1, 2])
    expect(r.sesiones[1].splits).toHaveLength(1)
  })

  it('no duplica splits en la raíz', () => {
    expect('splits' in r).toBe(false)
  })

  it('oculta la ruta de la foto si ya fue eliminada, y la conserva si no', () => {
    expect(r.capturas.find((c) => c.id === 'c1')?.storage_path).toBeNull()
    expect(r.capturas.find((c) => c.id === 'c2')?.storage_path).toBe('u/c2.jpg')
  })

  it('incluye consentimientos, registro de accesos y la fecha de exportación', () => {
    expect(r.consentimientos).toHaveLength(1)
    expect(r.registro_acceso).toHaveLength(1)
    expect(r.exportado_en).toBe('2026-10-22T12:00:00.000Z')
  })
})
