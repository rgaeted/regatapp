import type { SupabaseClient } from '@supabase/supabase-js'
import { leerCuenta, type PerfilAcceso } from './enlace'

/**
 * Estado de una cuenta que ya inició sesión:
 * - `ok`: puede usar la app (misma regla de siempre, en `perfilConAcceso`).
 * - `pendiente`: se registró sola y todavía no está vinculada a un atleta. No ve
 *   datos; la pantalla le explica que un entrenador debe vincularla.
 * - `sin_acceso`: sin perfil, o atleta inactivo, o consentimiento revocado.
 * Recibe service role. Sin `server-only` para vitest.
 */
export type EstadoCuenta =
  | { estado: 'ok'; perfil: PerfilAcceso }
  | { estado: 'pendiente'; nombre: string; usuario: string | null }
  | { estado: 'sin_acceso' }

export async function estadoCuenta(admin: SupabaseClient, usuarioId: string): Promise<EstadoCuenta> {
  // Una sola consulta por petición (antes eran dos o tres idas y vueltas a la base).
  const cuenta = await leerCuenta(admin, usuarioId)
  if (!cuenta) return { estado: 'sin_acceso' }
  const { usuario, ...perfil } = cuenta.perfil
  if (perfil.rol === 'remero' && !perfil.atleta_id) return { estado: 'pendiente', nombre: perfil.nombre, usuario }
  return cuenta.tieneAcceso ? { estado: 'ok', perfil } : { estado: 'sin_acceso' }
}
