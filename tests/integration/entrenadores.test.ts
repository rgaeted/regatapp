import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { iniciarConClave } from '@/lib/acceso/clave'
import { perfilConAcceso } from '@/lib/acceso/enlace'
import { atletaVisible } from '@/lib/atletas/administrar'
import { asignarAtleta, crearEntrenador, fijarClaveEntrenador, terminarAsignacion } from '@/lib/atletas/entrenadores'
import { admin, clienteAnonimo, crearAtleta, crearUsuario, limpiar, registrarUsuario } from './helpers'

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

describe('reasignar el mismo día', () => {
  it('terminar y volver a asignar restaura el acceso', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignarAtleta(adm.cliente, admin(), ent.id, atletaId)
    await terminarAsignacion(adm.cliente, ent.id, atletaId)
    expect(await atletaVisible(ent.cliente, atletaId)).toBe(false)

    expect(await asignarAtleta(adm.cliente, admin(), ent.id, atletaId)).toEqual({ ok: true })
    expect(await atletaVisible(ent.cliente, atletaId)).toBe(true)
  })
})

describe('entrenadores con usuario y contraseña', () => {
  const unico = () => `ent-${randomUUID().slice(0, 8)}`
  const CLAVE = 'una-clave-larga-1'
  const SITIO = 'http://localhost:3000'

  async function admin1() {
    return crearUsuario({ rol: 'admin' })
  }

  it('crearEntrenador con acceso: puede entrar con su usuario y contraseña, como entrenador', async () => {
    const adm = await admin1()
    const usuario = unico()
    const r = await crearEntrenador(admin(), { nombre: 'Coach Clave', creadoPor: adm.id, siteUrl: SITIO, acceso: { usuario, clave: CLAVE } })
    registrarUsuario(r.usuarioId)
    expect(r.usuario).toBe(usuario)
    expect(r.url).toContain('/entrar?t=') // el enlace sigue disponible como alternativa
    expect(await iniciarConClave(clienteAnonimo(), admin(), usuario, CLAVE)).toEqual({ ok: true })
    const { data } = await admin().from('perfil').select('rol, usuario').eq('user_id', r.usuarioId).single()
    expect(data).toEqual({ rol: 'entrenador', usuario })
  })

  it('un usuario inválido se rechaza antes de crear nada', async () => {
    const adm = await admin1()
    const nombre = `Coach ${unico()}`
    await expect(
      crearEntrenador(admin(), { nombre, creadoPor: adm.id, siteUrl: SITIO, acceso: { usuario: 'a b', clave: CLAVE } }),
    ).rejects.toThrow('3 a 32')
    const { count } = await admin().from('perfil').select('*', { count: 'exact', head: true }).eq('nombre', nombre)
    expect(count).toBe(0)
  })

  it('un usuario repetido se rechaza con un mensaje claro y no deja una cuenta a medias', async () => {
    const adm = await admin1()
    const usuario = unico()
    const primero = await crearEntrenador(admin(), { nombre: 'Primero', creadoPor: adm.id, siteUrl: SITIO, acceso: { usuario, clave: CLAVE } })
    registrarUsuario(primero.usuarioId)
    const nombre = `Segundo ${unico()}`
    await expect(
      crearEntrenador(admin(), { nombre, creadoPor: adm.id, siteUrl: SITIO, acceso: { usuario, clave: CLAVE } }),
    ).rejects.toThrow('Ese usuario ya existe.')
    const { count } = await admin().from('perfil').select('*', { count: 'exact', head: true }).eq('nombre', nombre)
    expect(count).toBe(0)
  })

  it('fijarClaveEntrenador cambia la contraseña: la anterior deja de servir', async () => {
    const adm = await admin1()
    const usuario = unico()
    const r = await crearEntrenador(admin(), { nombre: 'Coach Cambio', creadoPor: adm.id, siteUrl: SITIO, acceso: { usuario, clave: CLAVE } })
    registrarUsuario(r.usuarioId)
    await fijarClaveEntrenador(admin(), r.usuarioId, { usuario, clave: 'otra-clave-nueva-2' })
    expect((await iniciarConClave(clienteAnonimo(), admin(), usuario, CLAVE)).ok).toBe(false)
    expect(await iniciarConClave(clienteAnonimo(), admin(), usuario, 'otra-clave-nueva-2')).toEqual({ ok: true })
  })

  it('fijarClaveEntrenador no sirve para un remero', async () => {
    const atletaId = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId })
    await expect(fijarClaveEntrenador(admin(), remero.id, { usuario: unico(), clave: CLAVE })).rejects.toThrow()
  })
})
