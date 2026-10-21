import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { correoStaff, iniciarConClave } from '@/lib/acceso/clave'
import { estadoCuenta } from '@/lib/acceso/cuenta'
import { registrarCuenta } from '@/lib/acceso/registro'
import { cuentasPendientes, desvincularCuenta, eliminarCuentaPendiente, vincularCuenta } from '@/lib/acceso/vincular'
import { admin, asignar, clienteAnonimo, crearAtleta, crearUsuario, limpiar, registrarUsuario } from './helpers'

afterAll(limpiar)

const unico = () => `r-${randomUUID().slice(0, 8)}`
const CLAVE = 'una-clave-larga-1'

async function registrar(nombre = 'Cuenta Test') {
  const usuario = unico()
  // Tope alto: la corrida de tests registra muchas cuentas en una hora (el tope real se prueba aparte).
  const r = await registrarCuenta(admin(), { nombre, usuario, clave: CLAVE }, { tope: 10_000 })
  expect(r.ok).toBe(true)
  if (!r.ok) throw new Error(r.error)
  registrarUsuario(r.usuarioId)
  return { usuario, usuarioId: r.usuarioId }
}

describe('registrarCuenta', () => {
  it('con el tope superado rechaza el registro y no crea nada', async () => {
    const usuario = unico()
    const r = await registrarCuenta(admin(), { nombre: 'Tope', usuario, clave: CLAVE }, { tope: 0 })
    expect(r).toEqual({ ok: false, error: 'Hay muchos registros ahora. Intenta de nuevo en un rato.' })
    const { count } = await admin().from('perfil').select('*', { count: 'exact', head: true }).eq('usuario', usuario)
    expect(count).toBe(0)
  })

  it('crea una cuenta pendiente: rol remero, sin atleta, con su usuario', async () => {
    const { usuario, usuarioId } = await registrar('Ana Nueva')
    const { data } = await admin().from('perfil').select('rol, atleta_id, nombre, usuario').eq('user_id', usuarioId).single()
    expect(data).toEqual({ rol: 'remero', atleta_id: null, nombre: 'Ana Nueva', usuario })
    expect(await estadoCuenta(admin(), usuarioId)).toMatchObject({ estado: 'pendiente', nombre: 'Ana Nueva', usuario })
  })

  it('el usuario repetido se rechaza con un mensaje claro y no deja cuentas a medias', async () => {
    const { usuario } = await registrar()
    const r = await registrarCuenta(admin(), { nombre: 'Otra', usuario, clave: CLAVE })
    expect(r).toEqual({ ok: false, error: 'Ese usuario ya existe. Elige otro.' })
    const { count } = await admin().from('perfil').select('*', { count: 'exact', head: true }).eq('usuario', usuario)
    expect(count).toBe(1)
  })

  it('la cuenta recién creada puede iniciar sesión y queda pendiente, sin ver datos de nadie', async () => {
    const { usuario } = await registrar()
    const cliente = clienteAnonimo()
    expect(await iniciarConClave(cliente, admin(), usuario, CLAVE)).toEqual({ ok: true })
    const atletaAjeno = await crearAtleta()
    const { data } = await cliente.from('atleta').select('id').eq('id', atletaAjeno)
    expect(data).toEqual([])
    const { data: sesiones } = await cliente.from('sesion').select('id')
    expect(sesiones).toEqual([])
  })

  it('un registro nunca produce un entrenador ni un admin', async () => {
    const { usuarioId } = await registrar()
    const { data } = await admin().from('perfil').select('rol').eq('user_id', usuarioId).single()
    expect(data?.rol).toBe('remero')
  })

  it('una cuenta pendiente no puede darse un rol ni un atleta por la API', async () => {
    const { usuario, usuarioId } = await registrar()
    const atletaId = await crearAtleta()
    const cliente = clienteAnonimo()
    await iniciarConClave(cliente, admin(), usuario, CLAVE)
    await cliente.from('perfil').update({ rol: 'admin' }).eq('user_id', usuarioId)
    await cliente.from('perfil').update({ atleta_id: atletaId }).eq('user_id', usuarioId)
    const { data } = await admin().from('perfil').select('rol, atleta_id').eq('user_id', usuarioId).single()
    expect(data).toEqual({ rol: 'remero', atleta_id: null })
  })
})

describe('una cuenta pendiente no puede escribir en nada', () => {
  async function pendienteConSesion() {
    const { usuario, usuarioId } = await registrar()
    const cliente = clienteAnonimo()
    await iniciarConClave(cliente, admin(), usuario, CLAVE)
    return { cliente, usuarioId }
  }

  it('no sube archivos al bucket de fotos', async () => {
    const { cliente, usuarioId } = await pendienteConSesion()
    const { error } = await cliente.storage.from('capturas').upload(`${usuarioId}/${randomUUID()}.jpg`, new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' })
    expect(error).not.toBeNull()
  })

  it('no crea capturas', async () => {
    const { cliente, usuarioId } = await pendienteConSesion()
    const { error } = await cliente.from('captura').insert({ storage_path: `${usuarioId}/${randomUUID()}.jpg`, subida_por: usuarioId })
    expect(error).not.toBeNull()
  })

  it('no escribe en el registro de accesos', async () => {
    const { cliente } = await pendienteConSesion()
    const { error } = await cliente.rpc('registrar_acceso', { p_atleta_id: null, p_accion: 'spam', p_detalle: null })
    expect(error).not.toBeNull()
  })

  it('no lee competencias', async () => {
    const { cliente } = await pendienteConSesion()
    const { data } = await cliente.from('competencia').select('id')
    expect(data).toEqual([])
  })

  it('un remero ya vinculado sí puede subir su foto (la restricción no rompe el flujo normal)', async () => {
    const atletaId = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId })
    const { error } = await remero.cliente.storage.from('capturas').upload(`${remero.id}/${randomUUID()}.jpg`, new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' })
    expect(error).toBeNull()
    await admin().storage.from('capturas').remove((await admin().storage.from('capturas').list(remero.id)).data?.map((o) => `${remero.id}/${o.name}`) ?? [])
  })
})

describe('vincular cuentas', () => {
  it('el entrenador del atleta vincula una cuenta pendiente y esta pasa a ver sus datos', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignar(ent.id, atletaId)
    const { usuario, usuarioId } = await registrar('Remero Vinculado')

    expect((await cuentasPendientes(admin())).some((c) => c.usuarioId === usuarioId)).toBe(true)
    expect(await vincularCuenta(ent.cliente, admin(), atletaId, usuarioId)).toEqual({ ok: true })

    expect(await estadoCuenta(admin(), usuarioId)).toMatchObject({ estado: 'ok' })
    const { data: atleta } = await admin().from('atleta').select('user_id').eq('id', atletaId).single()
    expect(atleta?.user_id).toBe(usuarioId)
    expect((await cuentasPendientes(admin())).some((c) => c.usuarioId === usuarioId)).toBe(false)

    // y ve su propia ficha pero no la de otro atleta
    const cliente = clienteAnonimo()
    await iniciarConClave(cliente, admin(), usuario, CLAVE)
    const otro = await crearAtleta()
    expect((await cliente.from('atleta').select('id').eq('id', atletaId)).data).toHaveLength(1)
    expect((await cliente.from('atleta').select('id').eq('id', otro)).data).toEqual([])
  })

  it('un entrenador no asignado no puede vincular', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    const { usuarioId } = await registrar()
    const r = await vincularCuenta(ent.cliente, admin(), atletaId, usuarioId)
    expect(r).toEqual({ ok: false, error: 'No tienes acceso a este atleta.' })
    expect(await estadoCuenta(admin(), usuarioId)).toMatchObject({ estado: 'pendiente' })
  })

  it('no se puede vincular una cuenta de staff', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const atletaId = await crearAtleta()
    const staff = await crearUsuario({ rol: 'entrenador' })
    const r = await vincularCuenta(adm.cliente, admin(), atletaId, staff.id)
    expect(r).toEqual({ ok: false, error: 'Esa cuenta no se puede vincular.' })
  })

  it('una cuenta ya vinculada a otro atleta no se reasigna en silencio', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const a = await crearAtleta()
    const b = await crearAtleta()
    const { usuarioId } = await registrar()
    expect((await vincularCuenta(adm.cliente, admin(), a, usuarioId)).ok).toBe(true)
    expect(await vincularCuenta(adm.cliente, admin(), b, usuarioId)).toEqual({
      ok: false,
      error: 'Esa cuenta ya está vinculada a otro atleta.',
    })
  })

  it('al vincular otra cuenta, la anterior del atleta queda pendiente', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const atletaId = await crearAtleta()
    const primera = await registrar('Primera')
    const segunda = await registrar('Segunda')
    await vincularCuenta(adm.cliente, admin(), atletaId, primera.usuarioId)
    expect(await vincularCuenta(adm.cliente, admin(), atletaId, segunda.usuarioId)).toEqual({ ok: true })
    expect(await estadoCuenta(admin(), primera.usuarioId)).toMatchObject({ estado: 'pendiente' })
    expect(await estadoCuenta(admin(), segunda.usuarioId)).toMatchObject({ estado: 'ok' })
  })

  it('desvincular deja la cuenta pendiente y libera al atleta', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const atletaId = await crearAtleta()
    const { usuarioId } = await registrar()
    await vincularCuenta(adm.cliente, admin(), atletaId, usuarioId)
    expect(await desvincularCuenta(adm.cliente, admin(), atletaId)).toEqual({ ok: true })
    expect(await estadoCuenta(admin(), usuarioId)).toMatchObject({ estado: 'pendiente' })
    const { data } = await admin().from('atleta').select('user_id').eq('id', atletaId).single()
    expect(data?.user_id).toBeNull()
    expect(await desvincularCuenta(adm.cliente, admin(), atletaId)).toEqual({ ok: false, error: 'Este atleta no tiene una cuenta vinculada.' })
  })
})

describe('eliminarCuentaPendiente', () => {
  it('borra una cuenta pendiente por completo', async () => {
    const { usuarioId } = await registrar()
    expect(await eliminarCuentaPendiente(admin(), usuarioId)).toEqual({ ok: true })
    expect((await admin().auth.admin.getUserById(usuarioId)).data.user ?? null).toBeNull()
    expect((await cuentasPendientes(admin())).some((c) => c.usuarioId === usuarioId)).toBe(false)
  })

  it('no borra una cuenta vinculada ni una de staff', async () => {
    const adm = await crearUsuario({ rol: 'admin' })
    const atletaId = await crearAtleta()
    const { usuarioId } = await registrar()
    await vincularCuenta(adm.cliente, admin(), atletaId, usuarioId)
    expect(await eliminarCuentaPendiente(admin(), usuarioId)).toEqual({ ok: false, error: 'Solo se pueden borrar cuentas pendientes.' })
    expect((await eliminarCuentaPendiente(admin(), adm.id)).ok).toBe(false)
    expect((await admin().auth.admin.getUserById(usuarioId)).data.user).not.toBeNull()
  })
})

describe('estadoCuenta', () => {
  it('un remero con el consentimiento revocado queda sin acceso (no pendiente)', async () => {
    const atletaId = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId })
    await admin().from('consentimiento').update({ revocado_en: new Date().toISOString() }).eq('atleta_id', atletaId)
    expect(await estadoCuenta(admin(), remero.id)).toEqual({ estado: 'sin_acceso' })
  })

  it('el staff siempre tiene acceso y un usuario sin perfil, no', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    expect((await estadoCuenta(admin(), ent.id)).estado).toBe('ok')
    const { data } = await admin().auth.admin.createUser({ email: correoStaff(unico()), password: CLAVE, email_confirm: true })
    registrarUsuario(data.user!.id)
    expect(await estadoCuenta(admin(), data.user!.id)).toEqual({ estado: 'sin_acceso' })
  })
})
