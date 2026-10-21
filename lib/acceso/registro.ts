import type { SupabaseClient } from '@supabase/supabase-js'
import { correoStaff, normalizarUsuario, validarClave } from './clave'

/**
 * Registro abierto: cualquiera puede crear una cuenta con usuario y contraseña,
 * pero nace PENDIENTE (rol remero, sin atleta): no ve ningún dato hasta que un
 * entrenador o admin la vincule a una ficha (que ya tiene el consentimiento).
 * Nadie puede registrarse como entrenador o admin. Sin `server-only` para
 * reutilizarlo en vitest.
 */

/** Tope global de cuentas nuevas por hora: frena el relleno automático de la lista de pendientes. */
export const TOPE_CUENTAS_POR_HORA = 20

export const superaTope = (nuevasEnLaUltimaHora: number): boolean => nuevasEnLaUltimaHora >= TOPE_CUENTAS_POR_HORA

export type DatosRegistro = { nombre: string; usuario: string; clave: string }
export type ErroresRegistro = Partial<Record<keyof DatosRegistro, string>>

export function validarRegistro(entrada: DatosRegistro):
  | { ok: true; datos: DatosRegistro }
  | { ok: false; errores: ErroresRegistro } {
  const errores: ErroresRegistro = {}
  const nombre = entrada.nombre.trim()
  if (nombre.length < 2 || nombre.length > 60 || /[<>]/.test(nombre)) {
    errores.nombre = 'Escribe tu nombre (2 a 60 letras, sin < ni >).'
  }
  const usuario = normalizarUsuario(entrada.usuario)
  if (!usuario) errores.usuario = 'El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.'
  if (!validarClave(entrada.clave)) errores.clave = 'La contraseña debe tener al menos 8 caracteres.'
  if (Object.keys(errores).length > 0 || !usuario) return { ok: false, errores }
  return { ok: true, datos: { nombre, usuario, clave: entrada.clave } }
}

export type ResultadoRegistro = { ok: true; usuarioId: string } | { ok: false; error: string }

/**
 * Crea la cuenta pendiente. Recibe service role y NO autoriza: es una operación
 * pública a propósito, por eso solo puede producir un perfil `remero` sin atleta.
 */
export async function registrarCuenta(admin: SupabaseClient, datos: DatosRegistro): Promise<ResultadoRegistro> {
  const desde = new Date(Date.now() - 3_600_000).toISOString()
  const { count, error: errCuenta } = await admin
    .from('perfil')
    .select('user_id', { count: 'exact', head: true })
    .gte('creado_en', desde)
  if (errCuenta) throw new Error(`perfil: ${errCuenta.message}`)
  if (superaTope(count ?? 0)) return { ok: false, error: 'Hay muchos registros ahora. Intenta de nuevo en un rato.' }

  const { data, error } = await admin.auth.admin.createUser({
    email: correoStaff(datos.usuario),
    password: datos.clave,
    email_confirm: true,
  })
  if (error || !data.user) {
    const repetido = (error as { code?: string } | null)?.code === 'email_exists' || /already|registered/i.test(error?.message ?? '')
    return { ok: false, error: repetido ? 'Ese usuario ya existe. Elige otro.' : 'No se pudo crear la cuenta. Intenta de nuevo.' }
  }

  const { error: errPerfil } = await admin
    .from('perfil')
    .insert({ user_id: data.user.id, rol: 'remero', nombre: datos.nombre, usuario: datos.usuario })
  if (errPerfil) {
    await admin.auth.admin.deleteUser(data.user.id) // sin cuentas huérfanas
    return { ok: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' }
  }
  return { ok: true, usuarioId: data.user.id }
}
