import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vincular una cuenta registrada (pendiente) a la ficha de un atleta. Recibe el
 * cliente del usuario (RLS decide qué atletas ve) y service role (para leer
 * cuentas pendientes, que RLS no deja ver a un entrenador). El llamador ya
 * verificó que es entrenador o admin.
 */

export type CuentaPendiente = { usuarioId: string; nombre: string; usuario: string | null }
export type ResultadoVinculo = { ok: true } | { ok: false; error: string }

const SIN_ACCESO = 'No tienes acceso a este atleta.'

/** Cuentas que se registraron solas y esperan una ficha, las más recientes primero. */
export async function cuentasPendientes(admin: SupabaseClient): Promise<CuentaPendiente[]> {
  const { data, error } = await admin
    .from('perfil')
    .select('user_id, nombre, usuario')
    .eq('rol', 'remero')
    .is('atleta_id', null)
    .order('creado_en', { ascending: false })
    .limit(100)
  if (error) throw new Error(`perfil: ${error.message}`)
  return (data ?? []).map((p) => ({ usuarioId: p.user_id as string, nombre: p.nombre as string, usuario: (p.usuario as string | null) ?? null }))
}

async function atletaVisible(supabase: SupabaseClient, atletaId: string): Promise<boolean> {
  const { data, error } = await supabase.from('atleta').select('id').eq('id', atletaId).maybeSingle()
  if (error) throw new Error(`atleta: ${error.message}`)
  return data !== null
}

/**
 * Une la cuenta con el atleta. Si el atleta ya tenía otra cuenta, esa queda
 * pendiente (se desvincula) en vez de perder el acceso en silencio de forma
 * confusa; la cuenta nueva ocupa su lugar.
 */
export async function vincularCuenta(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  atletaId: string,
  usuarioId: string,
): Promise<ResultadoVinculo> {
  if (!(await atletaVisible(supabase, atletaId))) return { ok: false, error: SIN_ACCESO }

  const { data: cuenta, error: errCuenta } = await admin
    .from('perfil')
    .select('rol, atleta_id')
    .eq('user_id', usuarioId)
    .maybeSingle()
  if (errCuenta) throw new Error(`perfil: ${errCuenta.message}`)
  if (!cuenta || cuenta.rol !== 'remero') return { ok: false, error: 'Esa cuenta no se puede vincular.' }
  if (cuenta.atleta_id && cuenta.atleta_id !== atletaId) return { ok: false, error: 'Esa cuenta ya está vinculada a otro atleta.' }

  const { data: atleta, error: errAtleta } = await admin.from('atleta').select('user_id').eq('id', atletaId).single()
  if (errAtleta) throw new Error(`atleta: ${errAtleta.message}`)
  const anterior = atleta.user_id as string | null
  if (anterior && anterior !== usuarioId) {
    const { error } = await admin.from('perfil').update({ atleta_id: null }).eq('user_id', anterior)
    if (error) throw new Error(`perfil: ${error.message}`)
    // Se suelta antes de asignar la nueva (atleta.user_id es único).
    const { error: errLibre } = await admin.from('atleta').update({ user_id: null }).eq('id', atletaId)
    if (errLibre) throw new Error(`atleta: ${errLibre.message}`)
  }

  const { error: errA } = await admin.from('atleta').update({ user_id: usuarioId }).eq('id', atletaId)
  if (errA) throw new Error(`atleta: ${errA.message}`)
  const { error: errP } = await admin.from('perfil').update({ atleta_id: atletaId }).eq('user_id', usuarioId)
  if (errP) throw new Error(`perfil: ${errP.message}`)
  return { ok: true }
}

/** La cuenta vuelve a quedar pendiente (p. ej. se vinculó a la persona equivocada). */
export async function desvincularCuenta(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  atletaId: string,
): Promise<ResultadoVinculo> {
  if (!(await atletaVisible(supabase, atletaId))) return { ok: false, error: SIN_ACCESO }
  const { data: atleta, error } = await admin.from('atleta').select('user_id').eq('id', atletaId).single()
  if (error) throw new Error(`atleta: ${error.message}`)
  if (!atleta.user_id) return { ok: false, error: 'Este atleta no tiene una cuenta vinculada.' }
  const { error: errP } = await admin.from('perfil').update({ atleta_id: null }).eq('user_id', atleta.user_id)
  if (errP) throw new Error(`perfil: ${errP.message}`)
  const { error: errA } = await admin.from('atleta').update({ user_id: null }).eq('id', atletaId)
  if (errA) throw new Error(`atleta: ${errA.message}`)
  return { ok: true }
}

/**
 * Borra una cuenta pendiente (basura o equivocada). Solo si sigue pendiente:
 * una cuenta vinculada a un atleta no se elimina por acá. Recibe service role;
 * el llamador verificó que es admin.
 */
export async function eliminarCuentaPendiente(admin: SupabaseClient, usuarioId: string): Promise<ResultadoVinculo> {
  const { data, error } = await admin.from('perfil').select('rol, atleta_id').eq('user_id', usuarioId).maybeSingle()
  if (error) throw new Error(`perfil: ${error.message}`)
  if (!data || data.rol !== 'remero' || data.atleta_id) return { ok: false, error: 'Solo se pueden borrar cuentas pendientes.' }
  const { error: errBorrar } = await admin.auth.admin.deleteUser(usuarioId)
  if (errBorrar) throw new Error(`auth: ${errBorrar.message}`)
  return { ok: true }
}
