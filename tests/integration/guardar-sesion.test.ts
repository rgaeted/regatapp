import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardarSesion } from '@/lib/sesion/guardar'
import type { SesionInput } from '@/lib/schemas/sesion'
import { admin, asignar, crearAtleta, crearUsuario, limpiar } from './helpers'

afterAll(limpiar)

function sesion(atletaId: string, extra: Partial<SesionInput> = {}): SesionInput {
  return {
    id: randomUUID(),
    atleta_id: atletaId,
    tipo: 'entrenamiento',
    modalidad: 'ergometro',
    fecha: new Date().toISOString(),
    distancia_m: 2000,
    tiempo_ds: 4555,
    splits: [1, 2, 3, 4].map((orden) => ({ orden, distancia_m: 500, tiempo_ds: 1100 + orden })),
    ...extra,
  }
}

async function contar(tabla: 'sesion' | 'split', col: string, valor: string): Promise<number> {
  const { count, error } = await admin().from(tabla).select('*', { count: 'exact', head: true }).eq(col, valor)
  expect(error).toBeNull()
  return count ?? 0
}

async function entrenadorConAtleta(): Promise<{ cliente: SupabaseClient; id: string; atletaId: string }> {
  const ent = await crearUsuario({ rol: 'entrenador' })
  const atletaId = await crearAtleta()
  await asignar(ent.id, atletaId)
  return { cliente: ent.cliente, id: ent.id, atletaId }
}

describe('guardar_sesion', () => {
  it('entrenador asignado: guarda sesión y 4 splits, verificada y manual', async () => {
    const { cliente, id: entId, atletaId } = await entrenadorConAtleta()
    const input = sesion(atletaId)
    const r = await guardarSesion(cliente, input)
    expect(r).toEqual({ ok: true, id: input.id })
    const { data } = await admin().from('sesion').select('verificado, origen, creado_por').eq('id', input.id).single()
    expect(data).toEqual({ verificado: true, origen: 'manual', creado_por: entId })
    expect(await contar('split', 'sesion_id', input.id)).toBe(4)
  })

  it('el mismo id dos veces no duplica la sesión ni los splits', async () => {
    const { cliente, atletaId } = await entrenadorConAtleta()
    const input = sesion(atletaId)
    expect((await guardarSesion(cliente, input)).ok).toBe(true)
    expect(await guardarSesion(cliente, input)).toEqual({ ok: true, id: input.id })
    expect(await contar('sesion', 'id', input.id)).toBe(1)
    expect(await contar('split', 'sesion_id', input.id)).toBe(4)
  })

  it('un remero no puede guardar con el atleta_id de otro', async () => {
    const propio = await crearAtleta()
    const ajeno = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId: propio })
    const input = sesion(ajeno)
    const r = await guardarSesion(remero.cliente, input)
    expect(r.ok).toBe(false)
    expect(await contar('sesion', 'id', input.id)).toBe(0)
  })

  it('consentimiento revocado: error en español y cero filas', async () => {
    const { cliente, atletaId } = await entrenadorConAtleta()
    await admin().from('consentimiento').update({ revocado_en: new Date().toISOString() }).eq('atleta_id', atletaId)
    const input = sesion(atletaId)
    const r = await guardarSesion(cliente, input)
    expect(r).toEqual({
      ok: false,
      error: 'No se puede guardar: el atleta no tiene consentimiento vigente o está inactivo.',
    })
    expect(await contar('sesion', 'id', input.id)).toBe(0)
  })

  it('un split con tiempo 0 revierte también la sesión', async () => {
    const { cliente, atletaId } = await entrenadorConAtleta()
    const input = sesion(atletaId)
    // Se salta el esquema Zod a propósito: la base debe rechazarlo por sí sola.
    const r = await cliente.rpc('guardar_sesion', {
      p_sesion: { id: input.id, atleta_id: atletaId, tipo: 'entrenamiento', modalidad: 'ergometro', fecha: input.fecha },
      p_splits: [{ orden: 1, distancia_m: 500, tiempo_ds: 0 }],
    })
    expect(r.error).not.toBeNull()
    expect(await contar('sesion', 'id', input.id)).toBe(0)
  })
})
