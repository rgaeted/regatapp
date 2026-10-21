import type { SupabaseClient } from '@supabase/supabase-js'
import { establecerClaveStaff, validarCredenciales } from '@/lib/acceso/clave'
import { generarEnlace } from '@/lib/acceso/enlace'
import { crearUsuarioStaff } from '@/lib/acceso/usuario'
import { hoySantiago } from '@/lib/schemas/consentimiento'
import { diaAnterior } from '@/lib/fechas'
import type { Resultado } from './administrar'

export { diaAnterior }


/** Un error cuyo mensaje es seguro y útil de mostrar tal cual a quien administra. */
export class ErrorUsuario extends Error {}

const USUARIO_REPETIDO = 'Ese usuario ya existe.'

/** Valida usuario y contraseña y traduce los fallos de Auth a mensajes claros. */
async function fijarAcceso(admin: SupabaseClient, usuarioId: string, usuario: string, clave: string): Promise<string> {
  const v = validarCredenciales(usuario, clave)
  if (!v.ok) throw new ErrorUsuario(Object.values(v.errores)[0])
  // perfil.usuario es la fuente de verdad de los usuarios: se comprueba antes de tocar Auth.
  const { data: existente, error: errBusca } = await admin
    .from('perfil')
    .select('user_id')
    .eq('usuario', v.usuario)
    .neq('user_id', usuarioId)
    .maybeSingle()
  if (errBusca) throw new Error(`perfil: ${errBusca.message}`)
  if (existente) throw new ErrorUsuario(USUARIO_REPETIDO)
  try {
    await establecerClaveStaff(admin, usuarioId, v.usuario, clave)
  } catch (e) {
    const codigo = (e instanceof Error ? (e.cause as { code?: string } | undefined)?.code : undefined) ?? ''
    const mensaje = e instanceof Error ? e.message : ''
    // email_exists (GoTrue) o la unicidad de perfil.usuario (23505 / duplicate key).
    if (codigo === 'email_exists' || /already|registered|duplicate|exist/i.test(mensaje)) throw new ErrorUsuario(USUARIO_REPETIDO)
    throw e
  }
  return v.usuario
}

/**
 * Crea un entrenador y su primer enlace de acceso; con `acceso` también le fija
 * usuario y contraseña (el enlace queda como alternativa). Si algo falla no
 * deja una cuenta a medias. Recibe service role y NO autoriza: el llamador
 * verifica que es admin.
 */
export async function crearEntrenador(
  admin: SupabaseClient,
  opts: { nombre: string; creadoPor: string; siteUrl: string; acceso?: { usuario: string; clave: string } },
): Promise<{ usuarioId: string; url: string; usuario?: string }> {
  // Se valida ANTES de crear la cuenta: un usuario mal escrito no deja nada.
  if (opts.acceso) {
    const v = validarCredenciales(opts.acceso.usuario, opts.acceso.clave)
    if (!v.ok) throw new ErrorUsuario(Object.values(v.errores)[0])
  }
  const usuarioId = await crearUsuarioStaff(admin, { nombre: opts.nombre, rol: 'entrenador' })
  let usuario: string | undefined
  if (opts.acceso) {
    try {
      usuario = await fijarAcceso(admin, usuarioId, opts.acceso.usuario, opts.acceso.clave)
    } catch (e) {
      await admin.auth.admin.deleteUser(usuarioId) // sin cuentas huérfanas (borra también su perfil)
      throw e
    }
  }
  const url = await generarEnlace(admin, { usuarioId, creadoPor: opts.creadoPor, siteUrl: opts.siteUrl })
  return { usuarioId, url, usuario }
}

/** Fija o cambia el usuario y la contraseña de un entrenador (o admin). */
export async function fijarClaveEntrenador(
  admin: SupabaseClient,
  usuarioId: string,
  acceso: { usuario: string; clave: string },
): Promise<string> {
  return fijarAcceso(admin, usuarioId, acceso.usuario, acceso.clave)
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
