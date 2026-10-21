import type { SupabaseClient } from '@supabase/supabase-js'
import { perfilConAcceso, type PerfilAcceso } from './enlace'

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
  const { data, error } = await admin
    .from('perfil')
    .select('rol, nombre, atleta_id, usuario')
    .eq('user_id', usuarioId)
    .maybeSingle()
  if (error) throw new Error(`perfil: ${error.message}`)
  if (!data) return { estado: 'sin_acceso' }
  if (data.rol === 'remero' && !data.atleta_id) {
    return { estado: 'pendiente', nombre: data.nombre as string, usuario: (data.usuario as string | null) ?? null }
  }
  const perfil = await perfilConAcceso(admin, usuarioId)
  return perfil ? { estado: 'ok', perfil } : { estado: 'sin_acceso' }
}
