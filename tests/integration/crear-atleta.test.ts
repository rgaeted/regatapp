import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, clienteAnonimo, crearUsuario, limpiar } from './helpers'

const marca = `RPC-${randomUUID().slice(0, 8)}`
const creados: string[] = []

const consentimiento = (extra: Record<string, unknown> = {}) => ({
  otorgado_por_nombre: 'Apoderado Test',
  relacion: 'apoderado',
  medio: 'papel',
  version_texto: 'v1',
  otorgado_en: '2026-01-01',
  ...extra,
})
const atleta = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Test',
  apellido: `${marca}-${randomUUID().slice(0, 6)}`,
  fecha_nacimiento: '2012-03-04',
  ...extra,
})

async function llamar(c: SupabaseClient, a: Record<string, unknown>, cons: Record<string, unknown>) {
  const r = await c.rpc('crear_atleta_con_consentimiento', { p_atleta: a, p_consentimiento: cons })
  if (r.data) creados.push(r.data as string)
  return r
}

async function atletasConApellido(apellido: unknown) {
  const { data, error } = await admin().from('atleta').select('id').eq('apellido', apellido as string)
  expect(error).toBeNull()
  return data ?? []
}

afterAll(async () => {
  // Los atletas creados por la RPC no los conocen los helpers: se borran aca
  // (cascada a consentimiento y asignacion) y tambien por la marca, por si una
  // llamada fallo a medias.
  if (creados.length) await admin().from('atleta').delete().in('id', creados)
  await admin().from('atleta').delete().like('apellido', `${marca}%`)
  await limpiar()
})

describe('crear_atleta_con_consentimiento', () => {
  it('entrenador: recibe id, ve al atleta y su consentimiento, queda asignado', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const a = atleta({ peso_kg: 55.5, altura_cm: 170, sexo: 'M', categoria_peso: 'ligero' })
    const { data: id, error } = await llamar(ent.cliente, a, consentimiento({ otorgado_por_rut: '1-9' }))
    expect(error).toBeNull()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    const { data: fila } = await ent.cliente.from('atleta').select('*').eq('id', id).single()
    expect(fila).toMatchObject({ nombre: 'Test', apellido: a.apellido, peso_kg: 55.5, altura_cm: 170, sexo: 'M', categoria_peso: 'ligero', activo: true })

    const { data: cons } = await ent.cliente.from('consentimiento').select('*').eq('atleta_id', id)
    expect(cons).toHaveLength(1)
    expect(cons![0]).toMatchObject({ relacion: 'apoderado', otorgado_por_rut: '1-9', registrado_por: ent.id, revocado_en: null })

    const { data: asig } = await admin().from('asignacion_entrenador').select('*').eq('atleta_id', id)
    expect(asig).toHaveLength(1)
    expect(asig![0]).toMatchObject({ entrenador_id: ent.id, hasta: null })
    const { data: hoy } = await ent.cliente.rpc('hoy_santiago')
    expect(asig![0].desde).toBe(hoy)
  })

  it('remero: error y no crea nada', async () => {
    const rem = await crearUsuario({ rol: 'remero' })
    const a = atleta()
    const { data, error } = await llamar(rem.cliente, a, consentimiento())
    expect(data).toBeNull()
    expect(error?.message).toMatch(/sin permiso/)
    expect(await atletasConApellido(a.apellido)).toHaveLength(0)
  })

  it('anon: sin permiso de ejecucion', async () => {
    const a = atleta()
    const { data, error } = await llamar(clienteAnonimo(), a, consentimiento())
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(await atletasConApellido(a.apellido)).toHaveLength(0)
  })

  it('menor con relacion propio: error y no queda atleta', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const a = atleta({ fecha_nacimiento: '2012-03-04' })
    const { data, error } = await llamar(ent.cliente, a, consentimiento({ relacion: 'propio' }))
    expect(data).toBeNull()
    expect(error?.message).toMatch(/propio/)
    expect(await atletasConApellido(a.apellido)).toHaveLength(0)
  })

  it('sin fecha de nacimiento, propio se rechaza', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const a = atleta({ fecha_nacimiento: null })
    const { error } = await llamar(ent.cliente, a, consentimiento({ relacion: 'propio' }))
    expect(error).not.toBeNull()
    expect(await atletasConApellido(a.apellido)).toHaveLength(0)
  })

  it('adulto con propio: se acepta', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const { data, error } = await llamar(ent.cliente, atleta({ fecha_nacimiento: '1990-01-01' }), consentimiento({ relacion: 'propio' }))
    expect(error).toBeNull()
    expect(data).toBeTruthy()
  })

  it('atomicidad: relacion desconocida no deja atleta', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const a = atleta()
    const { data, error } = await llamar(ent.cliente, a, consentimiento({ relacion: 'amigo' }))
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(await atletasConApellido(a.apellido)).toHaveLength(0)
  })

  it('atomicidad: falta un campo obligatorio del consentimiento', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const a = atleta()
    const cons: Record<string, unknown> = consentimiento()
    delete cons.version_texto
    const { error } = await llamar(ent.cliente, a, cons)
    expect(error).not.toBeNull()
    expect(await atletasConApellido(a.apellido)).toHaveLength(0)
  })

  it('consentimiento con fecha futura se rechaza', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const a = atleta()
    const { error } = await llamar(ent.cliente, a, consentimiento({ otorgado_en: '2999-01-01' }))
    expect(error).not.toBeNull()
    expect(await atletasConApellido(a.apellido)).toHaveLength(0)
  })

  it('admin: crea el atleta sin asignacion', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const { data: id, error } = await llamar(adm.cliente, atleta(), consentimiento())
    expect(error).toBeNull()
    const { data: asig } = await admin().from('asignacion_entrenador').select('*').eq('atleta_id', id)
    expect(asig).toHaveLength(0)
    const { data: cons } = await admin().from('consentimiento').select('registrado_por').eq('atleta_id', id)
    expect(cons).toEqual([{ registrado_por: adm.id }])
  })

  it('lista blanca: user_id, concept2_user_id, activo y llaves desconocidas no se copian', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const victima = await crearUsuario({ rol: 'remero' })
    const a = atleta({
      user_id: victima.id,
      concept2_user_id: `c2-${marca}`,
      activo: false,
      id: randomUUID(),
      creado_en: '2000-01-01T00:00:00Z',
      inventada: 'x',
    })
    const { data: id, error } = await llamar(
      ent.cliente,
      a,
      consentimiento({ registrado_por: victima.id, revocado_en: '2026-01-02T00:00:00Z', atleta_id: randomUUID(), id: randomUUID() }),
    )
    expect(error).toBeNull()
    const { data: fila } = await admin().from('atleta').select('*').eq('id', id).single()
    expect(fila!.id).toBe(id)
    expect(fila!.user_id).toBeNull()
    expect(fila!.concept2_user_id).toBeNull()
    expect(fila!.activo).toBe(true)
    expect(new Date(fila!.creado_en).getFullYear()).toBeGreaterThan(2000)
    const { data: cons } = await admin().from('consentimiento').select('*').eq('atleta_id', id)
    expect(cons).toHaveLength(1)
    expect(cons![0].registrado_por).toBe(ent.id)
    expect(cons![0].revocado_en).toBeNull()
  })

  it('nombre en blanco se rechaza', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const { error } = await llamar(ent.cliente, atleta({ nombre: '   ' }), consentimiento())
    expect(error).not.toBeNull()
  })
})
