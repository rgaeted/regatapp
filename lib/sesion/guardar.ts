import type { SupabaseClient } from '@supabase/supabase-js'
import { sesionInputSchema, type SesionInput } from '@/lib/schemas/sesion'

export type ResultadoGuardar = { ok: true; id: string } | { ok: false; error: string }

const SIN_PERMISO =
  'No se puede guardar: el atleta no tiene consentimiento vigente o está inactivo.'
const GENERICO = 'No se pudo guardar la sesión. Intenta de nuevo.'

/**
 * Guarda la sesión y sus splits con la RPC `guardar_sesion` (una transacción,
 * con las políticas RLS del usuario). Reintentar con el mismo `id` es seguro.
 * Nunca devuelve mensajes SQL al usuario.
 */
export async function guardarSesion(supabase: SupabaseClient, input: SesionInput): Promise<ResultadoGuardar> {
  const valido = sesionInputSchema.safeParse(input)
  if (!valido.success) return { ok: false, error: 'Revisa los datos de la sesión.' }
  const { splits, ...sesion } = valido.data
  const { data, error } = await supabase.rpc('guardar_sesion', { p_sesion: sesion, p_splits: splits })
  if (error) {
    // 42501 = insufficient_privilege: RLS (consentimiento, atleta inactivo o ajeno).
    return { ok: false, error: error.code === '42501' ? SIN_PERMISO : GENERICO }
  }
  return { ok: true, id: data as string }
}
