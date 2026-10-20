import type { SupabaseClient } from '@supabase/supabase-js'
import { leerTodo, lotes } from './paginar'

type Fila = Record<string, unknown>

type Crudo = {
  atleta: Fila
  sesiones: (Fila & { id: string })[]
  splits: (Fila & { sesion_id: string; orden: number })[]
  capturas: (Fila & { id: string; foto_eliminada_en: string | null })[]
  consentimientos: Fila[]
  registro_acceso: Fila[]
}

export type ExportacionAtleta = {
  atleta: Fila
  sesiones: (Fila & { splits: Fila[] })[]
  capturas: Fila[]
  consentimientos: Fila[]
  registro_acceso: Fila[]
  exportado_en: string
}

/** Junta las filas sueltas en un documento: splits bajo su sesión; sin la ruta de fotos ya borradas. */
export function armarExportacion(crudo: Crudo, ahora: Date = new Date()): ExportacionAtleta {
  return {
    atleta: crudo.atleta,
    sesiones: crudo.sesiones.map((s) => ({
      ...s,
      splits: crudo.splits.filter((x) => x.sesion_id === s.id).sort((a, b) => a.orden - b.orden),
    })),
    capturas: crudo.capturas.map((c) => (c.foto_eliminada_en ? { ...c, storage_path: null } : c)),
    consentimientos: crudo.consentimientos,
    registro_acceso: crudo.registro_acceso,
    exportado_en: ahora.toISOString(),
  }
}

// Ids por consulta `in (...)`: con cientos la URL de PostgREST se pasa de largo.
const LOTE_IDS = 100

/**
 * Todos los datos de un atleta (Ley 21.719: derecho de acceso). Recibe service
 * role y NO autoriza: el llamador verifica que el usuario puede ver al atleta.
 */
export async function exportarAtleta(admin: SupabaseClient, atletaId: string): Promise<ExportacionAtleta> {
  const { data: atleta, error } = await admin.from('atleta').select('*').eq('id', atletaId).maybeSingle()
  if (error) throw new Error(`atleta: ${error.message}`)
  if (!atleta) throw new Error('El atleta no existe')

  // Todas las lecturas paginan (PostgREST corta en 1000 filas) con orden estable.
  const sesiones = await leerTodo<Crudo['sesiones'][number]>('sesion', (d, h) =>
    admin.from('sesion').select('*').eq('atleta_id', atletaId).order('id').range(d, h),
  )
  const idsCaptura = sesiones.map((s) => s.captura_id).filter((c): c is string => typeof c === 'string')
  const splits: Crudo['splits'] = []
  for (const lote of lotes(sesiones.map((s) => s.id), LOTE_IDS)) {
    splits.push(
      ...(await leerTodo<Crudo['splits'][number]>('split', (d, h) =>
        admin.from('split').select('*').in('sesion_id', lote).order('id').range(d, h),
      )),
    )
  }
  const capturas: Crudo['capturas'] = []
  for (const lote of lotes(idsCaptura, LOTE_IDS)) {
    capturas.push(
      ...(await leerTodo<Crudo['capturas'][number]>('captura', (d, h) =>
        admin.from('captura').select('*').in('id', lote).order('id').range(d, h),
      )),
    )
  }
  const consentimientos = await leerTodo<Fila>('consentimiento', (d, h) =>
    admin.from('consentimiento').select('*').eq('atleta_id', atletaId).order('id').range(d, h),
  )
  const registro = await leerTodo<Fila>('registro_acceso', (d, h) =>
    admin.from('registro_acceso').select('*').eq('atleta_id', atletaId).order('id').range(d, h),
  )

  return armarExportacion({ atleta, sesiones, splits, capturas, consentimientos, registro_acceso: registro })
}
