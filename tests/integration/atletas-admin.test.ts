import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { atletaVisible, cambiarActivo, generarEnlaceParaAtleta, revocarConsentimiento } from '@/lib/atletas/administrar'
import { eliminarAtleta } from '@/lib/atletas/eliminar'
import { exportarAtleta } from '@/lib/atletas/exportar'
import { perfilConAcceso } from '@/lib/acceso/enlace'
import { admin, asignar, crearAtleta, crearSesion, crearUsuario, limpiar, olvidarUsuario } from './helpers'

afterAll(limpiar)

const SITIO = 'http://localhost:3000'

async function enlacesDe(atletaId: string): Promise<number> {
  const { data: a } = await admin().from('atleta').select('user_id').eq('id', atletaId).single()
  if (!a?.user_id) return 0
  const { count } = await admin()
    .from('enlace_acceso')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', a.user_id)
  return count ?? 0
}

describe('generarEnlaceParaAtleta', () => {
  it('entrenador asignado recibe una URL /entrar?t=', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignar(ent.id, atletaId)
    const r = await generarEnlaceParaAtleta(ent.cliente, admin(), ent.id, atletaId, SITIO)
    expect('url' in r && r.url.startsWith(`${SITIO}/entrar?t=`)).toBe(true)
  })

  it('entrenador de otro atleta es rechazado y no se crea ningún enlace', async () => {
    const entA = await crearUsuario({ rol: 'entrenador' })
    const entB = await crearUsuario({ rol: 'entrenador' })
    const atletaDeB = await crearAtleta()
    await asignar(entB.id, atletaDeB)
    const r = await generarEnlaceParaAtleta(entA.cliente, admin(), entA.id, atletaDeB, SITIO)
    expect(r).toEqual({ error: 'No tienes acceso a este atleta.' })
    expect(await enlacesDe(atletaDeB)).toBe(0)
  })

  it('con el consentimiento revocado se rechaza', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignar(ent.id, atletaId)
    expect(await revocarConsentimiento(ent.cliente, admin(), atletaId)).toEqual({ ok: true })
    const r = await generarEnlaceParaAtleta(ent.cliente, admin(), ent.id, atletaId, SITIO)
    expect('error' in r).toBe(true)
  })
})

describe('revocarConsentimiento', () => {
  it('bloquea el acceso del atleta y anula sus enlaces pendientes', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignar(ent.id, atletaId)
    await generarEnlaceParaAtleta(ent.cliente, admin(), ent.id, atletaId, SITIO)
    const { data: a } = await admin().from('atleta').select('user_id').eq('id', atletaId).single()
    expect(await perfilConAcceso(admin(), a!.user_id as string)).not.toBeNull()

    expect(await revocarConsentimiento(ent.cliente, admin(), atletaId)).toEqual({ ok: true })

    expect(await perfilConAcceso(admin(), a!.user_id as string)).toBeNull()
    const { data: pendientes } = await admin()
      .from('enlace_acceso')
      .select('id')
      .eq('usuario_id', a!.user_id)
      .is('usado_en', null)
    expect(pendientes).toEqual([])
  })

  it('revocar dos veces no cambia revocado_en', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignar(ent.id, atletaId)
    await revocarConsentimiento(ent.cliente, admin(), atletaId)
    const { data: antes } = await admin().from('consentimiento').select('revocado_en').eq('atleta_id', atletaId).single()
    const r = await revocarConsentimiento(ent.cliente, admin(), atletaId)
    expect(r.ok).toBe(false)
    const { data: despues } = await admin().from('consentimiento').select('revocado_en').eq('atleta_id', atletaId).single()
    expect(despues).toEqual(antes)
  })

  it('un entrenador no asignado no puede revocar', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    expect((await revocarConsentimiento(ent.cliente, admin(), atletaId)).ok).toBe(false)
    const { data } = await admin().from('consentimiento').select('revocado_en').eq('atleta_id', atletaId).single()
    expect(data?.revocado_en).toBeNull()
  })
})

describe('cambiarActivo', () => {
  it('el entrenador asignado desactiva y reactiva', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignar(ent.id, atletaId)
    expect(await cambiarActivo(ent.cliente, atletaId, false)).toEqual({ ok: true })
    const { data } = await admin().from('atleta').select('activo').eq('id', atletaId).single()
    expect(data?.activo).toBe(false)
  })

  it('un entrenador no asignado no cambia nada', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    expect((await cambiarActivo(ent.cliente, atletaId, false)).ok).toBe(false)
  })
})

describe('atletaVisible', () => {
  it('es true para el entrenador asignado y false para otro', async () => {
    const entA = await crearUsuario({ rol: 'entrenador' })
    const entB = await crearUsuario({ rol: 'entrenador' })
    const atletaId = await crearAtleta()
    await asignar(entA.id, atletaId)
    expect(await atletaVisible(entA.cliente, atletaId)).toBe(true)
    expect(await atletaVisible(entB.cliente, atletaId)).toBe(false)
  })
})

describe('exportarAtleta', () => {
  it('incluye sesiones con splits y consentimiento, y nada de otro atleta', async () => {
    const atletaId = await crearAtleta()
    const otro = await crearAtleta()
    const s1 = await crearSesion(atletaId)
    await crearSesion(atletaId)
    await crearSesion(otro)
    await admin().from('split').insert({ sesion_id: s1, orden: 1, tiempo_ds: 1100 })

    const r = await exportarAtleta(admin(), atletaId)
    expect(r.atleta.id).toBe(atletaId)
    expect(r.sesiones).toHaveLength(2)
    expect(r.sesiones.find((s) => s.id === s1)?.splits).toHaveLength(1)
    expect(r.consentimientos).toHaveLength(1)
  })
})

describe('eliminarAtleta', () => {
  it('borra todo del atleta, su usuario de Auth y su foto, y deja la fila eliminar', async () => {
    const ejecutor = await crearUsuario({ rol: 'admin' })
    const atletaId = await crearAtleta()
    const userId = (await crearUsuario({ rol: 'remero', atletaId })).id
    await admin().from('atleta').update({ user_id: userId }).eq('id', atletaId)
    const sesionId = await crearSesion(atletaId)
    await admin().from('split').insert({ sesion_id: sesionId, orden: 1, tiempo_ds: 1100 })

    const ruta = `${userId}/${randomUUID()}.jpg`
    const { error: errSubida } = await admin().storage.from('capturas').upload(ruta, new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' })
    expect(errSubida).toBeNull()
    const { data: cap } = await admin().from('captura').insert({ storage_path: ruta, subida_por: userId }).select('id').single()
    await admin().from('sesion').update({ captura_id: cap!.id }).eq('id', sesionId)

    await eliminarAtleta(admin(), atletaId, ejecutor.id)
    olvidarUsuario(userId)

    for (const [tabla, col, val] of [
      ['atleta', 'id', atletaId],
      ['sesion', 'atleta_id', atletaId],
      ['split', 'sesion_id', sesionId],
      ['consentimiento', 'atleta_id', atletaId],
      ['captura', 'id', cap!.id],
    ] as const) {
      const { count } = await admin().from(tabla).select('*', { count: 'exact', head: true }).eq(col, val)
      expect(count, tabla).toBe(0)
    }
    const { data: u } = await admin().auth.admin.getUserById(userId)
    expect(u?.user ?? null).toBeNull()
    const { data: archivos } = await admin().storage.from('capturas').list(userId)
    expect(archivos ?? []).toHaveLength(0)

    const { data: reg } = await admin().from('registro_acceso').select('atleta_id, detalle').eq('accion', 'eliminar').eq('usuario_id', ejecutor.id)
    expect(reg).toEqual([{ atleta_id: null, detalle: { atleta_id_eliminado: atletaId } }])
  })

  it('se puede repetir sin error (reintentable)', async () => {
    const ejecutor = await crearUsuario({ rol: 'admin' })
    const atletaId = await crearAtleta()
    await eliminarAtleta(admin(), atletaId, ejecutor.id)
    await expect(eliminarAtleta(admin(), atletaId, ejecutor.id)).resolves.toBeUndefined()
  })
})
