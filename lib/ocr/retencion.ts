import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'capturas'

/** Días que se conserva una foto que nadie confirmó (diseño §5.4). */
export const DIAS_RETENCION = 7

/** Instante antes del cual una foto sin confirmar ya venció. */
export function fechaLimite(ahora: Date, dias: number = DIAS_RETENCION): string {
  return new Date(ahora.getTime() - dias * 86_400_000).toISOString()
}

/**
 * Borra la foto de Storage y marca `foto_eliminada_en`. Se conservan
 * `storage_path` y `respuesta_cruda`. Recibe service role y NO autoriza.
 * Repetirlo no hace nada; si Storage falla, lanza y no marca el borrado.
 */
export async function borrarFoto(admin: SupabaseClient, capturaId: string, ahora: Date = new Date()): Promise<void> {
  const { data: captura, error } = await admin
    .from('captura')
    .select('storage_path, foto_eliminada_en')
    .eq('id', capturaId)
    .maybeSingle()
  if (error) throw new Error(`captura: ${error.message}`)
  if (!captura || captura.foto_eliminada_en) return

  const { error: errStorage } = await admin.storage.from(BUCKET).remove([captura.storage_path as string])
  if (errStorage) throw new Error(`storage: ${errStorage.message}`)

  const { error: errMarca } = await admin.from('captura').update({ foto_eliminada_en: ahora.toISOString() }).eq('id', capturaId)
  if (errMarca) throw new Error(`captura: ${errMarca.message}`)
}

/**
 * Borra las fotos que llevan más de `DIAS_RETENCION` días sin confirmarse.
 * Un fallo no frena a las demás: se cuenta y el llamador decide.
 */
export async function borrarFotosVencidas(
  admin: SupabaseClient,
  ahora: Date = new Date(),
): Promise<{ borradas: number; fallidas: number }> {
  const { data, error } = await admin
    .from('captura')
    .select('id')
    .is('foto_eliminada_en', null)
    .lt('subida_en', fechaLimite(ahora))
  if (error) throw new Error(`captura: ${error.message}`)
  let borradas = 0
  let fallidas = 0
  for (const c of data ?? []) {
    try {
      await borrarFoto(admin, c.id as string, ahora)
      borradas++
    } catch {
      fallidas++
    }
  }
  return { borradas, fallidas }
}
