import type { SupabaseClient } from '@supabase/supabase-js'

import { leerTodo, lotes } from './paginar'

const BUCKET = 'capturas'
const LOTE_IDS = 100

function falla(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`${contexto}: ${error.message}`)
}

/**
 * Elimina todos los datos de un atleta (Ley 21.719: derecho de supresión):
 * fotos de Storage, capturas, su usuario de Auth y el atleta (que arrastra en
 * cascada sesiones, splits, consentimientos y asignaciones). `registro_acceso`
 * conserva sus filas con `atleta_id = null`, más una fila `eliminar`.
 *
 * Recibe service role y NO autoriza: el llamador verifica que es admin.
 * Falla en voz alta si un paso falla y se puede repetir: cada paso tolera que
 * lo anterior ya esté hecho, y el usuario de Auth se borra antes que el atleta
 * para no perder `user_id` si el proceso se interrumpe.
 */
export async function eliminarAtleta(admin: SupabaseClient, atletaId: string, ejecutadoPor: string): Promise<void> {
  const { data: atleta, error: errAtleta } = await admin.from('atleta').select('user_id').eq('id', atletaId).maybeSingle()
  falla('atleta', errAtleta)
  if (!atleta) return // ya eliminado

  // Capturas: las de sus sesiones y las que subió su propio usuario. Las lecturas
  // paginan (PostgREST corta en 1000 filas) para no dejar fotos huérfanas.
  const sesiones = await leerTodo<{ captura_id: string | null }>('sesion', (d, h) =>
    admin.from('sesion').select('captura_id').eq('atleta_id', atletaId).order('id').range(d, h),
  )
  const ids = new Set(sesiones.map((s) => s.captura_id).filter((c): c is string => c !== null))
  if (atleta.user_id) {
    const propias = await leerTodo<{ id: string }>('captura', (d, h) =>
      admin.from('captura').select('id').eq('subida_por', atleta.user_id).order('id').range(d, h),
    )
    for (const c of propias) ids.add(c.id)
  }
  for (const lote of lotes([...ids], LOTE_IDS)) {
    const capturas = await leerTodo<{ storage_path: string }>('captura', (d, h) =>
      admin.from('captura').select('storage_path').in('id', lote).order('id').range(d, h),
    )
    const rutas = capturas.map((c) => c.storage_path)
    if (rutas.length > 0) {
      const { error: errStorage } = await admin.storage.from(BUCKET).remove(rutas)
      falla('storage', errStorage)
    }
    const { error: errDel } = await admin.from('captura').delete().in('id', lote)
    falla('captura', errDel)
  }

  if (atleta.user_id) {
    const { error } = await admin.auth.admin.deleteUser(atleta.user_id as string)
    // Si el usuario ya no existe (reintento), seguimos.
    if (error && !/not.?found/i.test(error.message)) falla('auth', error)
  }

  const { error: errBorrar } = await admin.from('atleta').delete().eq('id', atletaId)
  falla('atleta', errBorrar)

  const { error: errReg } = await admin.from('registro_acceso').insert({
    accion: 'eliminar',
    atleta_id: null,
    usuario_id: ejecutadoPor,
    detalle: { atleta_id_eliminado: atletaId },
  })
  falla('registro_acceso', errReg)
}
