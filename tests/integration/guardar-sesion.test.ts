import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardarSesion } from '@/lib/sesion/guardar'
import type { SesionInput } from '@/lib/schemas/sesion'
import { admin, asignar, crearAtleta, crearUsuario, limpiar, registrarCaptura } from './helpers'

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

  it('el mismo id con otro atleta o tiempo es un conflicto, no un éxito', async () => {
    const { cliente, id: entId, atletaId } = await entrenadorConAtleta()
    const otro = await crearAtleta()
    await asignar(entId, otro)
    const input = sesion(atletaId)
    expect((await guardarSesion(cliente, input)).ok).toBe(true)

    const r1 = await guardarSesion(cliente, { ...input, atleta_id: otro })
    expect(r1).toEqual({ ok: false, error: 'Esta sesión ya se guardó con otros datos. Recarga la página e inténtalo de nuevo.' })
    const r2 = await guardarSesion(cliente, { ...input, tiempo_ds: 4000 })
    expect(r2.ok).toBe(false)
    expect(await contar('sesion', 'id', input.id)).toBe(1)
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

describe('guardar_sesion desde una foto', () => {
  async function capturaDe(userId: string): Promise<string> {
    const { data, error } = await admin()
      .from('captura')
      .insert({ storage_path: `${userId}/${randomUUID()}.jpg`, subida_por: userId })
      .select('id')
      .single()
    expect(error).toBeNull()
    registrarCaptura(data!.id as string)
    return data!.id as string
  }

  it('confirmada: origen ocr_foto, verificada, captura enlazada y editado_manual', async () => {
    const { cliente, id: entId, atletaId } = await entrenadorConAtleta()
    const capturaId = await capturaDe(entId)
    const input = sesion(atletaId)
    const r = await guardarSesion(cliente, input, { captura_id: capturaId, verificado: true, editado_manual: true })
    expect(r.ok).toBe(true)
    const { data } = await admin().from('sesion').select('origen, verificado, captura_id').eq('id', input.id).single()
    expect(data).toEqual({ origen: 'ocr_foto', verificado: true, captura_id: capturaId })
    const { data: cap } = await admin().from('captura').select('editado_manual').eq('id', capturaId).single()
    expect(cap?.editado_manual).toBe(true)
  })

  it('guardada sin revisar: verificado = false (queda fuera de récords)', async () => {
    const { cliente, id: entId, atletaId } = await entrenadorConAtleta()
    const capturaId = await capturaDe(entId)
    const input = sesion(atletaId)
    await guardarSesion(cliente, input, { captura_id: capturaId, verificado: false, editado_manual: false })
    const { data } = await admin().from('sesion').select('origen, verificado').eq('id', input.id).single()
    expect(data).toEqual({ origen: 'ocr_foto', verificado: false })
  })

  it('una captura de otro usuario es rechazada y no queda nada', async () => {
    const { cliente, atletaId } = await entrenadorConAtleta()
    const otro = await crearUsuario({ rol: 'entrenador' })
    const capturaAjena = await capturaDe(otro.id)
    const input = sesion(atletaId)
    const r = await guardarSesion(cliente, input, { captura_id: capturaAjena, verificado: true, editado_manual: false })
    expect(r.ok).toBe(false)
    expect(await contar('sesion', 'id', input.id)).toBe(0)
  })

  it('una foto produce a lo sumo una sesión', async () => {
    const { cliente, id: entId, atletaId } = await entrenadorConAtleta()
    const capturaId = await capturaDe(entId)
    const foto = { captura_id: capturaId, verificado: true, editado_manual: false }
    const primera = sesion(atletaId)
    expect((await guardarSesion(cliente, primera, foto)).ok).toBe(true)

    // Otro envío (id nuevo, p. ej. la página se volvió a abrir) con la misma foto.
    const segunda = sesion(atletaId)
    expect(await guardarSesion(cliente, segunda, foto)).toEqual({ ok: false, error: 'Esta foto ya se guardó como una sesión.' })
    expect(await contar('sesion', 'id', segunda.id)).toBe(0)
  })

  it('sin foto sigue siendo manual y verificada (compatibilidad con la fase 1)', async () => {
    const { cliente, atletaId } = await entrenadorConAtleta()
    const input = sesion(atletaId)
    await guardarSesion(cliente, input)
    const { data } = await admin().from('sesion').select('origen, verificado').eq('id', input.id).single()
    expect(data).toEqual({ origen: 'manual', verificado: true })
  })
})
