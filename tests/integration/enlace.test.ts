import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { asegurarUsuarioAtleta, correoSintetico, crearUsuarioStaff } from '@/lib/acceso/usuario'
import {
  accesoVigente,
  generarEnlace,
  marcarUsado,
  MENSAJES_ENLACE,
  resolverEnlace,
} from '@/lib/acceso/enlace'
import { admin, clienteAnonimo, crearAtleta, crearUsuario, limpiar, registrarUsuario } from './helpers'

const SITE = 'https://app.test'
afterAll(limpiar)

async function atletaConUsuario(nombre = 'Ana', apellido = 'Pérez') {
  const atletaId = await crearAtleta()
  await admin().from('atleta').update({ nombre, apellido }).eq('id', atletaId)
  const usuarioId = await asegurarUsuarioAtleta(admin(), atletaId)
  registrarUsuario(usuarioId)
  return { atletaId, usuarioId }
}
const tokenDe = (url: string) => new URL(url).searchParams.get('t') as string
const nuevoEnlace = async (usuarioId: string, creadoPor: string | null = null) =>
  tokenDe(await generarEnlace(admin(), { usuarioId, creadoPor, siteUrl: SITE }))

describe('correoSintetico', () => {
  it('arma el correo', () => {
    expect(correoSintetico('a', 'x')).toMatch(/^a-x@.+/)
  })
})

describe('asegurarUsuarioAtleta', () => {
  it('es idempotente, deja un perfil con nombre de la BD y user_id en atleta', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    expect(await asegurarUsuarioAtleta(admin(), atletaId)).toBe(usuarioId)
    const { data: perfiles } = await admin().from('perfil').select('rol,nombre,atleta_id').eq('user_id', usuarioId)
    expect(perfiles).toEqual([{ rol: 'remero', nombre: 'Ana Pérez', atleta_id: atletaId }])
    const { data: a } = await admin().from('atleta').select('user_id').eq('id', atletaId).single()
    expect(a?.user_id).toBe(usuarioId)
  })

  it('llamadas concurrentes devuelven el mismo usuario', async () => {
    const atletaId = await crearAtleta()
    const ids = await Promise.all([1, 2, 3].map(() => asegurarUsuarioAtleta(admin(), atletaId)))
    ids.forEach(registrarUsuario)
    expect(new Set(ids).size).toBe(1)
    const { data } = await admin().from('perfil').select('user_id').eq('atleta_id', atletaId)
    expect(data).toHaveLength(1)
  })

  it('falla con un atleta inexistente', async () => {
    await expect(asegurarUsuarioAtleta(admin(), randomUUID())).rejects.toThrow()
  })
})

describe('generar y resolver enlaces', () => {
  it('resolver no consume: 3 lecturas y luego verifyOtp funciona', async () => {
    const { usuarioId } = await atletaConUsuario()
    const url = await generarEnlace(admin(), { usuarioId, creadoPor: null, siteUrl: SITE })
    expect(url.startsWith(`${SITE}/entrar?t=`)).toBe(true)
    const token = tokenDe(url)
    for (let i = 0; i < 3; i++) {
      expect(await resolverEnlace(admin(), token)).toEqual({ ok: true, nombre: 'Ana Pérez', usuarioId })
    }
    const { data, error } = await clienteAnonimo().auth.verifyOtp({ type: 'magiclink', token_hash: token })
    expect(error).toBeNull()
    expect(data.session?.user.id).toBe(usuarioId)
  })

  it('tras verifyOtp + marcarUsado da usado; segundo verifyOtp falla; marcarUsado repetido es no-op', async () => {
    const { usuarioId } = await atletaConUsuario()
    const token = await nuevoEnlace(usuarioId)
    const { error } = await clienteAnonimo().auth.verifyOtp({ type: 'magiclink', token_hash: token })
    expect(error).toBeNull()
    await marcarUsado(admin(), token)
    const { data: f1 } = await admin().from('enlace_acceso').select('usado_en').eq('token_hash', token).single()
    expect(f1?.usado_en).not.toBeNull()
    await marcarUsado(admin(), token)
    const { data: f2 } = await admin().from('enlace_acceso').select('usado_en').eq('token_hash', token).single()
    expect(f2?.usado_en).toBe(f1?.usado_en)
    expect(await resolverEnlace(admin(), token)).toEqual({ ok: false, motivo: 'usado' })
    const r2 = await clienteAnonimo().auth.verifyOtp({ type: 'magiclink', token_hash: token })
    expect(r2.error).not.toBeNull()
  })

  it('vence_en es ~24 h', async () => {
    const { usuarioId } = await atletaConUsuario()
    const token = await nuevoEnlace(usuarioId)
    const { data } = await admin().from('enlace_acceso').select('vence_en').eq('token_hash', token).single()
    const horas = (Date.parse(data!.vence_en) - Date.now()) / 3.6e6
    expect(horas).toBeGreaterThan(23.9)
    expect(horas).toBeLessThanOrEqual(24)
  })

  it('token aleatorio, vacío o malformado -> inexistente sin lanzar', async () => {
    for (const t of [randomUUID(), '', '   ', 'a'.repeat(5000), "'; drop table x;--", '%00']) {
      expect(await resolverEnlace(admin(), t)).toEqual({ ok: false, motivo: 'inexistente' })
    }
  })

  it('vencido', async () => {
    const { usuarioId } = await atletaConUsuario()
    const token = await nuevoEnlace(usuarioId)
    await admin().from('enlace_acceso').update({ vence_en: new Date(Date.now() - 1000).toISOString() }).eq('token_hash', token)
    expect(await resolverEnlace(admin(), token)).toEqual({ ok: false, motivo: 'vencido' })
  })

  it('solo revela nombre y usuarioId', async () => {
    const { usuarioId } = await atletaConUsuario()
    const token = await nuevoEnlace(usuarioId)
    const r = await resolverEnlace(admin(), token)
    expect(Object.keys(r).sort()).toEqual(['nombre', 'ok', 'usuarioId'])
    expect(JSON.stringify(r)).not.toContain('invalid')
    expect(JSON.stringify(r)).not.toContain(token)
  })

  it('un enlace nuevo reemplaza al anterior: t1 queda usado y verifyOtp(t1) falla; t2 funciona', async () => {
    const { usuarioId } = await atletaConUsuario()
    const t1 = await nuevoEnlace(usuarioId)
    const t2 = await nuevoEnlace(usuarioId)
    expect(t1).not.toBe(t2)
    expect(await resolverEnlace(admin(), t1)).toEqual({ ok: false, motivo: 'usado' })
    expect((await resolverEnlace(admin(), t2)).ok).toBe(true)
    const v1 = await clienteAnonimo().auth.verifyOtp({ type: 'magiclink', token_hash: t1 })
    expect(v1.error).not.toBeNull()
    const v2 = await clienteAnonimo().auth.verifyOtp({ type: 'magiclink', token_hash: t2 })
    expect(v2.error).toBeNull()
    expect(v2.data.session?.user.id).toBe(usuarioId)
  })

  it('generarEnlace rechaza atleta inactivo, consentimiento revocado y usuario sin perfil', async () => {
    const a = await atletaConUsuario()
    await admin().from('atleta').update({ activo: false }).eq('id', a.atletaId)
    await expect(generarEnlace(admin(), { usuarioId: a.usuarioId, creadoPor: null, siteUrl: SITE })).rejects.toThrow(/acceso vigente/)

    const b = await atletaConUsuario()
    await admin().from('consentimiento').update({ revocado_en: new Date().toISOString() }).eq('atleta_id', b.atletaId)
    await expect(generarEnlace(admin(), { usuarioId: b.usuarioId, creadoPor: null, siteUrl: SITE })).rejects.toThrow(/acceso vigente/)

    const { data } = await admin().auth.admin.createUser({ email: `s-${randomUUID()}@test.invalid`, email_confirm: true })
    registrarUsuario(data.user!.id)
    await expect(generarEnlace(admin(), { usuarioId: data.user!.id, creadoPor: null, siteUrl: SITE })).rejects.toThrow(/acceso vigente/)

    const { count } = await admin().from('enlace_acceso').select('*', { count: 'exact', head: true }).in('usuario_id', [a.usuarioId, b.usuarioId, data.user!.id])
    expect(count).toBe(0)
  })

  it('asegurarUsuarioAtleta rechaza user_id de staff o de un usuario sin perfil', async () => {
    for (const rol of ['entrenador', 'admin'] as const) {
      const atletaId = await crearAtleta()
      const staff = await crearUsuario({ rol, nombre: 'Staff' })
      await admin().from('atleta').update({ user_id: staff.id }).eq('id', atletaId)
      await expect(asegurarUsuarioAtleta(admin(), atletaId)).rejects.toThrow(/no es el remero/)
    }
    const { data } = await admin().auth.admin.createUser({ email: `s-${randomUUID()}@test.invalid`, email_confirm: true })
    registrarUsuario(data.user!.id)
    const atleta2 = await crearAtleta()
    await admin().from('atleta').update({ user_id: data.user!.id }).eq('id', atleta2)
    await expect(asegurarUsuarioAtleta(admin(), atleta2)).rejects.toThrow(/no es el remero/)
  })

  it('atleta inactivo -> sin_acceso y accesoVigente false', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    const token = await nuevoEnlace(usuarioId)
    expect(await accesoVigente(admin(), usuarioId)).toBe(true)
    await admin().from('atleta').update({ activo: false }).eq('id', atletaId)
    expect(await resolverEnlace(admin(), token)).toEqual({ ok: false, motivo: 'sin_acceso' })
    expect(await accesoVigente(admin(), usuarioId)).toBe(false)
  })

  it('consentimiento revocado -> sin_acceso y accesoVigente false', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    const token = await nuevoEnlace(usuarioId)
    const { error } = await admin().from('consentimiento').update({ revocado_en: new Date().toISOString() }).eq('atleta_id', atletaId)
    expect(error).toBeNull()
    expect(await resolverEnlace(admin(), token)).toEqual({ ok: false, motivo: 'sin_acceso' })
    expect(await accesoVigente(admin(), usuarioId)).toBe(false)
  })

  it('atleta borrado -> inexistente o sin_acceso, sin lanzar', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    const token = await nuevoEnlace(usuarioId)
    const { error } = await admin().from('atleta').delete().eq('id', atletaId)
    expect(error).toBeNull()
    const r = await resolverEnlace(admin(), token)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['inexistente', 'sin_acceso']).toContain(r.motivo)
    expect(await accesoVigente(admin(), usuarioId)).toBe(false)
  })

  it('registra generar_enlace en registro_acceso', async () => {
    const { atletaId, usuarioId } = await atletaConUsuario()
    const { id: entrenador } = await crearUsuario({ rol: 'entrenador', nombre: 'Coach' })
    await nuevoEnlace(usuarioId, entrenador)
    const { data } = await admin().from('registro_acceso').select('usuario_id,atleta_id,detalle').eq('accion', 'generar_enlace').eq('atleta_id', atletaId)
    expect(data).toEqual([{ usuario_id: entrenador, atleta_id: atletaId, detalle: { usuario_objetivo: usuarioId, origen: 'app' } }])
  })

  it('el registro de un enlace de script o de staff lleva el usuario objetivo', async () => {
    const id = await crearUsuarioStaff(admin(), { nombre: 'Coach Script', rol: 'entrenador' })
    registrarUsuario(id)
    await nuevoEnlace(id)
    const { data } = await admin().from('registro_acceso').select('usuario_id,atleta_id,detalle').eq('accion', 'generar_enlace').eq('detalle->>usuario_objetivo', id)
    expect(data).toEqual([{ usuario_id: null, atleta_id: null, detalle: { usuario_objetivo: id, origen: 'script' } }])
  })

  it('generarEnlace falla si el usuario no existe', async () => {
    await expect(generarEnlace(admin(), { usuarioId: randomUUID(), creadoPor: null, siteUrl: SITE })).rejects.toThrow()
  })
})

describe('staff', () => {
  it('crearUsuarioStaff crea perfil y accesoVigente es true; sin perfil es false', async () => {
    const id = await crearUsuarioStaff(admin(), { nombre: 'Coach Uno', rol: 'entrenador' })
    registrarUsuario(id)
    const { data } = await admin().from('perfil').select('rol,nombre,atleta_id').eq('user_id', id).single()
    expect(data).toEqual({ rol: 'entrenador', nombre: 'Coach Uno', atleta_id: null })
    expect(await accesoVigente(admin(), id)).toBe(true)
    const token = await nuevoEnlace(id)
    expect(await resolverEnlace(admin(), token)).toEqual({ ok: true, nombre: 'Coach Uno', usuarioId: id })

    const { data: sinPerfil } = await admin().auth.admin.createUser({ email: `s-${randomUUID()}@test.invalid`, email_confirm: true })
    registrarUsuario(sinPerfil.user!.id)
    expect(await accesoVigente(admin(), sinPerfil.user!.id)).toBe(false)
  })

  it('admin con correo dado', async () => {
    const correo = `adm-${randomUUID()}@test.invalid`
    const id = await crearUsuarioStaff(admin(), { nombre: 'Adm', rol: 'admin', correo })
    registrarUsuario(id)
    const { data } = await admin().auth.admin.getUserById(id)
    expect(data.user?.email).toBe(correo)
  })
})

describe('MENSAJES_ENLACE', () => {
  it('copy exacto', () => {
    expect(MENSAJES_ENLACE).toEqual({
      inexistente: 'Este enlace no es válido.',
      vencido: 'Este enlace venció. Pídele uno nuevo a tu entrenador.',
      usado: 'Este enlace ya se usó. Pídele uno nuevo a tu entrenador.',
      sin_acceso: 'Tu acceso está desactivado. Habla con tu entrenador.',
      reintentar: 'No pudimos entrar ahora. Intenta de nuevo en unos minutos.',
    })
  })
})
