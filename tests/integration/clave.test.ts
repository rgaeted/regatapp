import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { correoStaff, ERROR_CREDENCIALES, establecerClaveStaff, iniciarConClave } from '@/lib/acceso/clave'
import { admin, clienteAnonimo, crearAtleta, crearUsuario, limpiar, registrarUsuario } from './helpers'

afterAll(limpiar)

const unico = () => `t-${randomUUID().slice(0, 8)}`
const CLAVE = 'una-clave-larga-1'

describe('establecerClaveStaff / iniciarConClave', () => {
  it('un admin con usuario y clave inicia sesión', async () => {
    const u = await crearUsuario({ rol: 'admin', nombre: 'Admin Test' })
    const usuario = unico()
    await establecerClaveStaff(admin(), u.id, usuario, CLAVE)
    expect(await iniciarConClave(clienteAnonimo(), admin(), usuario.toUpperCase(), CLAVE)).toEqual({ ok: true })
  })

  it('un entrenador también', async () => {
    const u = await crearUsuario({ rol: 'entrenador' })
    const usuario = unico()
    await establecerClaveStaff(admin(), u.id, usuario, CLAVE)
    expect(await iniciarConClave(clienteAnonimo(), admin(), usuario, CLAVE)).toEqual({ ok: true })
  })

  it('clave incorrecta y usuario inexistente dan el mismo mensaje', async () => {
    const u = await crearUsuario({ rol: 'admin' })
    const usuario = unico()
    await establecerClaveStaff(admin(), u.id, usuario, CLAVE)
    const mala = await iniciarConClave(clienteAnonimo(), admin(), usuario, 'otra-clave-1234')
    const inexistente = await iniciarConClave(clienteAnonimo(), admin(), unico(), CLAVE)
    expect(mala).toEqual({ ok: false, error: ERROR_CREDENCIALES })
    expect(inexistente).toEqual(mala)
  })

  it('no se puede fijar clave a un remero', async () => {
    const atletaId = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId })
    await expect(establecerClaveStaff(admin(), remero.id, unico(), CLAVE)).rejects.toThrow('Solo entrenadores y admins')
  })

  it('un remero vinculado a un atleta con consentimiento entra con su contraseña', async () => {
    const atletaId = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId })
    const usuario = unico()
    await admin().auth.admin.updateUserById(remero.id, { email: correoStaff(usuario), password: CLAVE })
    expect(await iniciarConClave(clienteAnonimo(), admin(), usuario, CLAVE)).toEqual({ ok: true })
  })

  it('un remero cuyo consentimiento fue revocado NO entra y no queda con sesión', async () => {
    const atletaId = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId })
    const usuario = unico()
    await admin().auth.admin.updateUserById(remero.id, { email: correoStaff(usuario), password: CLAVE })
    await admin().from('consentimiento').update({ revocado_en: new Date().toISOString() }).eq('atleta_id', atletaId)
    const cliente = clienteAnonimo()
    expect(await iniciarConClave(cliente, admin(), usuario, CLAVE)).toEqual({ ok: false, error: ERROR_CREDENCIALES })
    expect((await cliente.auth.getSession()).data.session).toBeNull()
  })

  it('una cuenta sin perfil no entra', async () => {
    const usuario = unico()
    const { data } = await admin().auth.admin.createUser({ email: correoStaff(usuario), password: CLAVE, email_confirm: true })
    registrarUsuario(data.user!.id)
    expect(await iniciarConClave(clienteAnonimo(), admin(), usuario, CLAVE)).toEqual({ ok: false, error: ERROR_CREDENCIALES })
  })

  it('dos cuentas no pueden compartir el mismo usuario', async () => {
    const a = await crearUsuario({ rol: 'entrenador' })
    const b = await crearUsuario({ rol: 'entrenador' })
    const usuario = unico()
    await establecerClaveStaff(admin(), a.id, usuario, CLAVE)
    await expect(establecerClaveStaff(admin(), b.id, usuario, CLAVE)).rejects.toThrow()
  })

  it('rechaza usuario o clave inválidos antes de tocar Auth', async () => {
    const u = await crearUsuario({ rol: 'admin' })
    await expect(establecerClaveStaff(admin(), u.id, 'a b', CLAVE)).rejects.toThrow('Usuario inválido')
    await expect(establecerClaveStaff(admin(), u.id, unico(), 'corta')).rejects.toThrow('al menos 8')
  })
})
