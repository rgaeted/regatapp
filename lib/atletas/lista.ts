import type { SupabaseClient } from '@supabase/supabase-js'

export const COOKIE_ULTIMO_ATLETA = 'ultimo_atleta'

export type AtletaResumen = { id: string; nombre: string; apellido: string }

/** Atletas activos que el usuario puede ver (RLS), ordenados por apellido. */
export async function atletasVisibles(supabase: SupabaseClient): Promise<AtletaResumen[]> {
  const { data, error } = await supabase
    .from('atleta')
    .select('id, nombre, apellido')
    .eq('activo', true)
    .order('apellido')
    .order('nombre')
  if (error) throw new Error(`atletas: ${error.message}`)
  return data as AtletaResumen[]
}

/** El último atleta usado si sigue en la lista; si no, el primero. */
export function atletaPorDefecto(atletas: AtletaResumen[], ultimo: string | undefined): string {
  return atletas.find((a) => a.id === ultimo)?.id ?? atletas[0]?.id ?? ''
}
