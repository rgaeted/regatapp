import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { borrarFoto, borrarFotosVencidas, fechaLimite } from '@/lib/ocr/retencion'

type Fila = { id: string; storage_path: string; foto_eliminada_en: string | null; subida_en: string }

/** Cliente falso con solo lo que usa retencion.ts. */
function falso(filas: Fila[], errorStorage = false, fallaRuta?: string) {
  const removidos: string[] = []
  const admin = {
    from: () => {
      const filtros: ((f: Fila) => boolean)[] = []
      let modo: 'select' | 'update' = 'select'
      let cambios: Partial<Fila> = {}
      const aplicar = () => filas.filter((f) => filtros.every((fn) => fn(f)))
      const b = {
        select: () => { modo = 'select'; return b },
        update: (c: Partial<Fila>) => { modo = 'update'; cambios = c; return b },
        eq: (col: keyof Fila, v: string) => { filtros.push((f) => f[col] === v); return b },
        is: (col: keyof Fila, v: null) => { filtros.push((f) => f[col] === v); return b },
        lt: (col: keyof Fila, v: string) => { filtros.push((f) => String(f[col]) < v); return b },
        maybeSingle: async () => ({ data: aplicar()[0] ?? null, error: null }),
        then: (ok: (r: unknown) => void) => {
          const hit = aplicar()
          if (modo === 'update') hit.forEach((f) => Object.assign(f, cambios))
          ok({ data: modo === 'select' ? hit : null, error: null })
        },
      }
      return b
    },
    storage: {
      from: () => ({
        remove: async (rutas: string[]) => {
          if (errorStorage || (fallaRuta && rutas.includes(fallaRuta))) return { error: { message: 'boom' } }
          removidos.push(...rutas)
          return { error: null }
        },
      }),
    },
  } as unknown as SupabaseClient
  return { admin, removidos }
}

const AHORA = new Date('2026-10-21T12:00:00Z')

describe('fechaLimite', () => {
  it('resta los días de retención', () => {
    expect(fechaLimite(AHORA, 7)).toBe('2026-10-14T12:00:00.000Z')
  })
})

describe('borrarFoto', () => {
  it('borra el archivo y marca foto_eliminada_en, conservando storage_path', async () => {
    const filas = [{ id: 'c1', storage_path: 'u/c1.jpg', foto_eliminada_en: null, subida_en: '2026-10-20T00:00:00Z' }]
    const { admin, removidos } = falso(filas)
    await borrarFoto(admin, 'c1', AHORA)
    expect(removidos).toEqual(['u/c1.jpg'])
    expect(filas[0].foto_eliminada_en).toBe(AHORA.toISOString())
    expect(filas[0].storage_path).toBe('u/c1.jpg')
  })

  it('repetirlo no vuelve a tocar Storage', async () => {
    const filas = [{ id: 'c1', storage_path: 'u/c1.jpg', foto_eliminada_en: '2026-10-20T00:00:00Z', subida_en: '2026-10-19T00:00:00Z' }]
    const { admin, removidos } = falso(filas)
    await borrarFoto(admin, 'c1', AHORA)
    expect(removidos).toEqual([])
  })

  it('si Storage falla, lanza y NO marca la foto como borrada', async () => {
    const filas = [{ id: 'c1', storage_path: 'u/c1.jpg', foto_eliminada_en: null, subida_en: '2026-10-20T00:00:00Z' }]
    const { admin } = falso(filas, true)
    await expect(borrarFoto(admin, 'c1', AHORA)).rejects.toThrow('storage')
    expect(filas[0].foto_eliminada_en).toBeNull()
  })

  it('una captura inexistente no es un error', async () => {
    const { admin } = falso([])
    await expect(borrarFoto(admin, 'nada', AHORA)).resolves.toBeUndefined()
  })
})

describe('borrarFotosVencidas', () => {
  it('borra solo las de más de 7 días que siguen con foto', async () => {
    const filas: Fila[] = [
      { id: 'vieja', storage_path: 'u/vieja.jpg', foto_eliminada_en: null, subida_en: '2026-10-01T00:00:00Z' },
      { id: 'reciente', storage_path: 'u/reciente.jpg', foto_eliminada_en: null, subida_en: '2026-10-20T00:00:00Z' },
      { id: 'ya', storage_path: 'u/ya.jpg', foto_eliminada_en: '2026-10-05T00:00:00Z', subida_en: '2026-10-01T00:00:00Z' },
    ]
    const { admin, removidos } = falso(filas)
    expect(await borrarFotosVencidas(admin, AHORA)).toEqual({ borradas: 1, fallidas: 0 })
    expect(removidos).toEqual(['u/vieja.jpg'])
  })

  it('si una foto falla sigue con las demás y cuenta el fallo', async () => {
    const filas: Fila[] = [
      { id: 'a', storage_path: 'u/a.jpg', foto_eliminada_en: null, subida_en: '2026-10-01T00:00:00Z' },
      { id: 'b', storage_path: 'u/b.jpg', foto_eliminada_en: null, subida_en: '2026-10-01T00:00:00Z' },
    ]
    const { admin, removidos } = falso(filas, false, 'u/a.jpg')
    expect(await borrarFotosVencidas(admin, AHORA)).toEqual({ borradas: 1, fallidas: 1 })
    expect(removidos).toEqual(['u/b.jpg'])
  })
})