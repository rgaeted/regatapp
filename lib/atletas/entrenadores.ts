import type { SupabaseClient } from '@supabase/supabase-js'
import { generarEnlace } from '@/lib/acceso/enlace'
import { crearUsuarioStaff } from '@/lib/acceso/usuario'
import { hoySantiago } from '@/lib/schemas/consentimiento'
import { diaAnterior } from '@/lib/fechas'
import type { Resultado } from './administrar'

export { diaAnterior }


/**
 * Crea un entrenador y su primer enlace de acceso. Recibe service role y NO
 * autoriza: el llamador verifica que es admin.
 */
export async function crearEntrenador(
  admin: SupabaseClient,
  opts: { nombre: string; creadoPor: string; siteUrl: string },
): Promise<{ usuarioId: string; url: string }> {
  const usuarioId = await crearUsuarioStaff(admin, { nombre: opts.nombre, rol: 'entrenador' })
  const url = await generarEnlace(admin, { usuarioId, creadoPor: opts.creadoPor, siteUrl: opts.siteUrl })
  return { usuarioId, url }
}

/**
 * Asigna un atleta a un entrenador desde hoy. `supabase` es el cliente del
 * usuario: la política de la tabla solo deja insertar al admin. `admin` solo
 * verifica que el destino sea de verdad un entrenador.
 */
export async function asignarAtleta(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  entrenadorId: string,
  atletaId: string,
): Promise<Resultado> {
  const { data: perfil, error: errPerfil } = await admin.from('perfil').select('rol').eq('user_id', entrenadorId).maybeSingle()
  if (errPerfil) throw new Error(`perfil: ${errPerfil.message}`)
  if (perfil?.rol !== 'entrenador') return { ok: false, error: 'Esa persona no es entrenador.' }

  const { error } = await supabase.from('asignacion_entrenador').insert({ entrenador_id: entrenadorId, atleta_id: atletaId })
  if (error?.code === '23505') {
    // Ya hay una fila con desde = hoy (la clave incluye `desde`). Si se había
    // terminado hoy ("Quitar" por error), se reactiva; si seguía vigente, no cambia nada.
    const { error: errReactivar } = await supabase
      .from('asignacion_entrenador')
      .update({ hasta: null })
      .eq('entrenador_id', entrenadorId)
      .eq('atleta_id', atletaId)
      .not('hasta', 'is', null)
    if (errReactivar) return { ok: false, error: 'No se pudo asignar el atleta.' }
    return { ok: true }
  }
  if (error) {
    return { ok: false, error: error.code === '42501' ? 'Solo un admin puede asignar atletas.' : 'No se pudo asignar el atleta.' }
  }
  return { ok: true }
}

/**
 * Termina la asignación vigente con `hasta` = ayer, así deja de valer de
 * inmediato (la regla es `hasta >= hoy`).
 */
export async function terminarAsignacion(supabase: SupabaseClient, entrenadorId: string, atletaId: string): Promise<Resultado> {
  const { data, error } = await supabase
    .from('asignacion_entrenador')
    .update({ hasta: diaAnterior(hoySantiago()) })
    .eq('entrenador_id', entrenadorId)
    .eq('atleta_id', atletaId)
    .is('hasta', null)
    .select('atleta_id')
  if (error) return { ok: false, error: 'No se pudo terminar la asignación.' }
  if (!data || data.length === 0) return { ok: false, error: 'No hay una asignación vigente que terminar.' }
  return { ok: true }
}
