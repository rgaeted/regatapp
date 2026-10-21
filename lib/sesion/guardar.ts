import type { SupabaseClient } from '@supabase/supabase-js'
import { sesionInputSchema, type SesionInput } from '@/lib/schemas/sesion'

/** Datos de la foto de la que salió la sesión (fase 2). */
export type OrigenFoto = { captura_id: string; verificado: boolean; editado_manual: boolean }

export type ResultadoGuardar = { ok: true; id: string } | { ok: false; error: string }

const SIN_PERMISO =
  'No se puede guardar: el atleta no tiene consentimiento vigente o está inactivo.'
const CONFLICTO = 'Esta sesión ya se guardó con otros datos. Recarga la página e inténtalo de nuevo.'
const FOTO_USADA = 'Esta foto ya se guardó como una sesión.'
const GENERICO = 'No se pudo guardar la sesión. Intenta de nuevo.'

/**
 * Guarda la sesión y sus splits con la RPC `guardar_sesion` (una transacción,
 * con las políticas RLS del usuario). Reintentar con el mismo `id` es seguro.
 * Nunca devuelve mensajes SQL al usuario.
 */
export async function guardarSesion(
  supabase: SupabaseClient,
  input: SesionInput,
  foto?: OrigenFoto,
): Promise<ResultadoGuardar> {
  const valido = sesionInputSchema.safeParse(input)
  if (!valido.success) return { ok: false, error: 'Revisa los datos de la sesión.' }
  const { splits, ...sesion } = valido.data
  const { data, error } = await supabase.rpc('guardar_sesion', foto ? { p_sesion: sesion, p_splits: splits, p_ocr: foto } : { p_sesion: sesion, p_splits: splits })
  if (error) {
    // 42501 = insufficient_privilege: RLS (consentimiento, atleta inactivo o ajeno).
    // RG001: la captura ya tiene una sesión (ver la migración 000007).
    if (error.code === 'RG001') return { ok: false, error: FOTO_USADA }
    // 23505: el id ya existe con otros datos (ver la migración 000006).
    if (error.code === '23505') return { ok: false, error: CONFLICTO }
    return { ok: false, error: error.code === '42501' ? SIN_PERMISO : GENERICO }
  }
  return { ok: true, id: data as string }
}
