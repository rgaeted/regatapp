import { afterAll, describe, expect, it } from 'vitest'
import { asegurarUsuarioAtleta, crearUsuarioStaff } from '@/lib/acceso/usuario'
import { generarEnlace, resolverEnlace } from '@/lib/acceso/enlace'
import { canjearEnlace } from '@/lib/acceso/canjear'
import { admin, clienteAnonimo, crearAtleta, limpiar, registrarUsuario } from './helpers'

const SITE = 'https://app.test'
afterAll(limpiar)

async function atletaConUsuario() {
  const atletaId = await crearAtleta()
  const usuarioId = await asegurarUsuarioAtleta(admin(), atletaId)
  registrarUsuario(usuarioId)
  return { atletaId, usuarioId }
}
const tokenDe = (url: string) => new URL(url).searchParams.get('t') as string
const nuevoEnlace = async (usuarioId: string) =>
  tokenDe(await generarEnlace(admin(), { usuarioId, creadoPor: null, siteUrl: SITE }))
const sesionDe = async (auth: ReturnType<typeof clienteAnonimo>) => (await auth.auth.getSession()).data.session

describe('canjearEnlace', () => {
  it('(a) camino feliz: previsualizar 3 veces no consume; canjear deja sesión del usuario correcto', async () => {
    const { usuarioId } = await atletaConUsuario()
    const t = await nuevoEnlace(usuarioId)
    for (let i = 0; i < 3; i++) expect((await resolverEnlace(admin(), t)).ok).toBe(true)
    const auth = clienteAnonimo()
    expect(await canjearEnlace({ admin: admin(), auth }, t)).toEqual({ ok: true })
    const { data } = await auth.auth.getUser()
    expect(data.user?.id).toBe(usuarioId)
    expect(await resolverEnlace(admin(), t)).toEqual({ ok: false, motivo: 'usado' })
  })

  it('(b) segundo canje del mismo token: usado y sin sesión', async () => {
    const { usuarioId } = await atletaConUsuario()
    const t = await nuevoEnlace(usuarioId)
    expect(await canjearEnlace({ admin: admin(), auth: clienteAnonimo() }, t)).toEqual({ ok: true })
    const auth2 = clienteAnonimo()
    expect(await canjearEnlace({ admin: admin(), auth: auth2 }, t)).toEqual({ ok: false, motivo: 'usado' })
    expect(await sesionDe(auth2)).toBeNull()
  })

  it('(c) atleta desactivado tras generar el enlace: sin_acceso y sin sesión (credencial al portador)', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    const t = await nuevoEnlace(usuarioId)
    await admin().from('atleta').update({ activo: false }).eq('id', atletaId)
    const auth = clienteAnonimo()
    expect(await canjearEnlace({ admin: admin(), auth }, t)).toEqual({ ok: false, motivo: 'sin_acceso' })
    expect(await sesionDe(auth)).toBeNull()
  })

  it('(c2) acceso perdido entre resolver y verifyOtp: el re-chequeo posterior cierra la sesión', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    const t = await nuevoEnlace(usuarioId)
    const auth = clienteAnonimo()
    const original = auth.auth.verifyOtp.bind(auth.auth)
    // Carrera simulada: se desactiva justo antes de que GoTrue consuma el token.
    auth.auth.verifyOtp = (async (params: Parameters<typeof original>[0]) => {
      await admin().from('atleta').update({ activo: false }).eq('id', atletaId)
      return original(params)
    }) as typeof original
    expect(await canjearEnlace({ admin: admin(), auth }, t)).toEqual({ ok: false, motivo: 'sin_acceso' })
    expect(await sesionDe(auth)).toBeNull()
  })

  it('(d) consentimiento revocado: sin_acceso y sin sesión', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    const t = await nuevoEnlace(usuarioId)
    await admin().from('consentimiento').update({ revocado_en: new Date().toISOString() }).eq('atleta_id', atletaId)
    const auth = clienteAnonimo()
    expect(await canjearEnlace({ admin: admin(), auth }, t)).toEqual({ ok: false, motivo: 'sin_acceso' })
    expect(await sesionDe(auth)).toBeNull()
  })

  it('(e) vencido', async () => {
    const { usuarioId } = await atletaConUsuario()
    const t = await nuevoEnlace(usuarioId)
    await admin().from('enlace_acceso').update({ vence_en: new Date(Date.now() - 1000).toISOString() }).eq('token_hash', t)
    const auth = clienteAnonimo()
    expect(await canjearEnlace({ admin: admin(), auth }, t)).toEqual({ ok: false, motivo: 'vencido' })
    expect(await sesionDe(auth)).toBeNull()
  })

  it('(f) token basura: inexistente', async () => {
    const auth = clienteAnonimo()
    expect(await canjearEnlace({ admin: admin(), auth }, 'no-existe')).toEqual({ ok: false, motivo: 'inexistente' })
    expect(await canjearEnlace({ admin: admin(), auth }, '<script>')).toEqual({ ok: false, motivo: 'inexistente' })
    expect(await sesionDe(auth)).toBeNull()
  })

  it('(g) staff (entrenador) puede canjear', async () => {
    const id = await crearUsuarioStaff(admin(), { nombre: 'Coach', rol: 'entrenador' })
    registrarUsuario(id)
    const t = await nuevoEnlace(id)
    const auth = clienteAnonimo()
    expect(await canjearEnlace({ admin: admin(), auth }, t)).toEqual({ ok: true })
    expect((await auth.auth.getUser()).data.user?.id).toBe(id)
  })
})
