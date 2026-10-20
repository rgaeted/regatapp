import { afterAll, describe, expect, it } from 'vitest'
import { cambiarActivo, generarEnlaceParaAtleta, revocarConsentimiento } from '@/lib/atletas/administrar'
import { perfilConAcceso } from '@/lib/acceso/enlace'
import { admin, asignar, crearAtleta, crearUsuario, limpiar } from './helpers'

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
