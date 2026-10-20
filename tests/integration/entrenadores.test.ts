import { afterAll, describe, expect, it } from 'vitest'
import { perfilConAcceso } from '@/lib/acceso/enlace'
import { atletaVisible } from '@/lib/atletas/administrar'
import { asignarAtleta, crearEntrenador, terminarAsignacion } from '@/lib/atletas/entrenadores'
import { admin, crearAtleta, crearUsuario, limpiar, registrarUsuario } from './helpers'

afterAll(limpiar)

describe('crearEntrenador', () => {
  it('crea el perfil entrenador con acceso vigente y devuelve un enlace', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const r = await crearEntrenador(admin(), { nombre: 'Coach Test', creadoPor: adm.id, siteUrl: 'http://localhost:3000' })
    registrarUsuario(r.usuarioId)
    expect(r.url.startsWith('http://localhost:3000/entrar?t=')).toBe(true)
    const perfil = await perfilConAcceso(admin(), r.usuarioId)
    expect(perfil).toMatchObject({ rol: 'entrenador', nombre: 'Coach Test' })
  })
})

describe('asignarAtleta / terminarAsignacion', () => {
  it('tras asignar el entrenador ve al atleta; tras terminar, deja de verlo', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()

    expect(await atletaVisible(ent.cliente, atletaId)).toBe(false)
    expect(await asignarAtleta(adm.cliente, admin(), ent.id, atletaId)).toEqual({ ok: true })
    expect(await atletaVisible(ent.cliente, atletaId)).toBe(true)

    expect(await terminarAsignacion(adm.cliente, ent.id, atletaId)).toEqual({ ok: true })
    expect(await atletaVisible(ent.cliente, atletaId)).toBe(false)
  })

  it('asignar dos veces el mismo día no falla', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignarAtleta(adm.cliente, admin(), ent.id, atletaId)
    expect(await asignarAtleta(adm.cliente, admin(), ent.id, atletaId)).toEqual({ ok: true })
  })

  it('no se puede asignar a alguien que no es entrenador', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const atletaId = await crearAtleta()
    const otro = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId: otro })
    const r = await asignarAtleta(adm.cliente, admin(), remero.id, atletaId)
    expect(r.ok).toBe(false)
  })

  it('un entrenador no puede asignarse atletas a sí mismo', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    const r = await asignarAtleta(ent.cliente, admin(), ent.id, atletaId)
    expect(r.ok).toBe(false)
    expect(await atletaVisible(ent.cliente, atletaId)).toBe(false)
  })
})
