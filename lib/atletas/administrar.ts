import type { SupabaseClient } from '@supabase/supabase-js'
import { asegurarUsuarioAtleta } from '@/lib/acceso/usuario'
import { generarEnlace } from '@/lib/acceso/enlace'

/**
 * Operaciones de administración de un atleta. `supabase` es el cliente del
 * usuario (RLS decide qué puede tocar); `admin` es service role y solo se usa
 * para lo que RLS no permite a nadie (enlaces de acceso, cuentas de Auth).
 * El llamador verifica el rol (entrenador o admin) antes de llegar acá.
 */

export type Resultado = { ok: true } | { ok: false; error: string }

const SIN_ACCESO = 'No tienes acceso a este atleta.'

export async function generarEnlaceParaAtleta(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  creadoPor: string,
  atletaId: string,
  siteUrl: string,
): Promise<{ url: string } | { error: string }> {
  // RLS: si el usuario no ve al atleta, la consulta vuelve vacía.
  const { data: visible, error } = await supabase.from('atleta').select('id').eq('id', atletaId).maybeSingle()
  if (error) throw new Error(`atleta: ${error.message}`)
  if (!visible) return { error: SIN_ACCESO }

  try {
    const usuarioId = await asegurarUsuarioAtleta(admin, atletaId)
    const url = await generarEnlace(admin, { usuarioId, creadoPor, siteUrl })
    return { url }
  } catch {
    return { error: 'No se pudo generar el enlace. Revisa que el atleta esté activo y con consentimiento vigente.' }
  }
}

/**
 * Marca el consentimiento vigente como revocado (el trigger de la base solo
 * permite eso) y anula los enlaces de acceso pendientes del atleta. Con
 * `perfilConAcceso` el atleta queda sin acceso en la siguiente petición.
 */
export async function revocarConsentimiento(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  atletaId: string,
): Promise<Resultado> {
  const { data, error } = await supabase
    .from('consentimiento')
    .update({ revocado_en: new Date().toISOString() })
    .eq('atleta_id', atletaId)
    .is('revocado_en', null)
    .select('id')
  if (error) return { ok: false, error: 'No se pudo revocar el consentimiento.' }
  if (!data || data.length === 0) {
    return { ok: false, error: 'No hay un consentimiento vigente que revocar, o no tienes acceso.' }
  }

  const { data: atleta } = await admin.from('atleta').select('user_id').eq('id', atletaId).maybeSingle()
  if (atleta?.user_id) {
    const { error: errEnl } = await admin
      .from('enlace_acceso')
      .update({ usado_en: new Date().toISOString() })
      .eq('usuario_id', atleta.user_id)
      .is('usado_en', null)
    if (errEnl) throw new Error(`enlace_acceso: ${errEnl.message}`)
  }
  return { ok: true }
}

export async function cambiarActivo(supabase: SupabaseClient, atletaId: string, activo: boolean): Promise<Resultado> {
  const { data, error } = await supabase.from('atleta').update({ activo }).eq('id', atletaId).select('id')
  if (error) return { ok: false, error: 'No se pudo actualizar el atleta.' }
  if (!data || data.length === 0) return { ok: false, error: SIN_ACCESO }
  return { ok: true }
}
