import type { SupabaseClient } from '@supabase/supabase-js'
import { esErrorTransitorio } from './errores-auth'
import { perfilConAcceso } from './enlace'

/**
 * Entrada con usuario y contraseña, solo para entrenadores y admins. Los
 * remeros (incluidos los menores) siguen entrando por enlace: sus cuentas no
 * tienen contraseña y el dominio del correo derivado no coincide con el suyo.
 * Sin `server-only` para que lo reutilicen scripts y vitest.
 */

const DOMINIO_STAFF = 'staff.regatapp.invalid'
const USUARIO_VALIDO = /^[a-z0-9._-]{3,32}$/
const LARGO_MINIMO_CLAVE = 8

export const ERROR_CREDENCIALES = 'Usuario o contraseña incorrectos.'
const ERROR_TRANSITORIO = 'No pudimos entrar ahora. Intenta de nuevo en unos minutos.'

/** Minúsculas y recortado; null si no cumple el formato. */
export function normalizarUsuario(texto: string): string | null {
  const u = texto.trim().toLowerCase()
  return USUARIO_VALIDO.test(u) ? u : null
}

/** Correo sintético con que el usuario existe en Auth (nadie lo lee). */
export function correoStaff(usuario: string): string {
  return `${usuario}@${DOMINIO_STAFF}`
}

/** Largo mínimo; no se recorta ni se normaliza la clave. */
export function validarClave(clave: string): boolean {
  return clave.length >= LARGO_MINIMO_CLAVE && clave.trim().length > 0
}

/**
 * Fija usuario y contraseña de una cuenta de staff. Recibe service role y NO
 * autoriza: el llamador es un script o un admin verificado. Rechaza cuentas
 * que no sean entrenador o admin.
 */
export async function establecerClaveStaff(
  admin: SupabaseClient,
  usuarioId: string,
  usuario: string,
  clave: string,
): Promise<void> {
  const normalizado = normalizarUsuario(usuario)
  if (!normalizado) throw new Error('Usuario inválido: 3 a 32 caracteres entre a-z, 0-9, punto, guion y guion bajo')
  if (!validarClave(clave)) throw new Error(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`)

  const { data: perfil, error: errPerfil } = await admin.from('perfil').select('rol').eq('user_id', usuarioId).maybeSingle()
  if (errPerfil) throw new Error(`perfil: ${errPerfil.message}`)
  if (perfil?.rol !== 'entrenador' && perfil?.rol !== 'admin') {
    throw new Error('Solo entrenadores y admins pueden tener contraseña')
  }

  const { error } = await admin.auth.admin.updateUserById(usuarioId, {
    email: correoStaff(normalizado),
    password: clave,
    email_confirm: true,
  })
  if (error) throw new Error(`No se pudo fijar la contraseña: ${error.message}`)
}

export type ResultadoClave = { ok: true } | { ok: false; error: string }

/**
 * Inicia sesión (cookies de sesión en `auth`) si el usuario es staff con acceso
 * vigente. Cualquier fallo de credenciales da el mismo mensaje, para no revelar
 * si el usuario existe. Un remero que adivine un usuario no entra: se rechaza
 * y se cierra la sesión que acaba de abrirse.
 */
export async function iniciarConClave(
  auth: SupabaseClient,
  admin: SupabaseClient,
  usuario: string,
  clave: string,
): Promise<ResultadoClave> {
  const normalizado = normalizarUsuario(usuario)
  if (!normalizado || clave === '') return { ok: false, error: ERROR_CREDENCIALES }

  const { data, error } = await auth.auth.signInWithPassword({ email: correoStaff(normalizado), password: clave })
  if (error) {
    return { ok: false, error: esErrorTransitorio(error) ? ERROR_TRANSITORIO : ERROR_CREDENCIALES }
  }

  const perfil = await perfilConAcceso(admin, data.user.id)
  if (!perfil || perfil.rol === 'remero') {
    await auth.auth.signOut({ scope: 'local' })
    return { ok: false, error: ERROR_CREDENCIALES }
  }
  return { ok: true }
}
