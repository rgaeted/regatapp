import type { SupabaseClient } from '@supabase/supabase-js'

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

async function leer<T>(contexto: string, p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p
  if (error) throw new Error(`${contexto}: ${error.message}`)
  return data ?? []
}

/**
 * Todos los datos de un atleta (Ley 21.719: derecho de acceso). Recibe service
 * role y NO autoriza: el llamador verifica que el usuario puede ver al atleta.
 */
export async function exportarAtleta(admin: SupabaseClient, atletaId: string): Promise<ExportacionAtleta> {
  const { data: atleta, error } = await admin.from('atleta').select('*').eq('id', atletaId).maybeSingle()
  if (error) throw new Error(`atleta: ${error.message}`)
  if (!atleta) throw new Error('El atleta no existe')

  const sesiones = await leer<Crudo['sesiones'][number]>('sesion', admin.from('sesion').select('*').eq('atleta_id', atletaId))
  const ids = sesiones.map((s) => s.id)
  const idsCaptura = sesiones.map((s) => s.captura_id).filter((c): c is string => typeof c === 'string')
  const splits = ids.length
    ? await leer<Crudo['splits'][number]>('split', admin.from('split').select('*').in('sesion_id', ids))
    : []
  const capturas = idsCaptura.length
    ? await leer<Crudo['capturas'][number]>('captura', admin.from('captura').select('*').in('id', idsCaptura))
    : []
  const consentimientos = await leer<Fila>('consentimiento', admin.from('consentimiento').select('*').eq('atleta_id', atletaId))
  const registro = await leer<Fila>('registro_acceso', admin.from('registro_acceso').select('*').eq('atleta_id', atletaId))

  return armarExportacion({ atleta, sesiones, splits, capturas, consentimientos, registro_acceso: registro })
}
