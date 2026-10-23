import type { SupabaseClient } from '@supabase/supabase-js'
import { leerTodo } from '@/lib/atletas/paginar'
import type { FilaProgreso } from './calculos'

/**
 * Sesiones verificadas de un atleta (RLS decide si el usuario puede verlas) y
 * cuántas sin verificar quedaron fuera. Las sin verificar nunca entran a
 * récords, curvas ni volumen (AGENTS.md §5). Pagina: PostgREST corta en 1000.
 */
export async function cargarProgreso(
  supabase: SupabaseClient,
  atletaId: string,
): Promise<{ filas: FilaProgreso[]; sinVerificar: number }> {
  // Las dos lecturas son independientes: en paralelo (cada ida y vuelta a la base suma tiempo).
  const [filas, { count, error }] = await Promise.all([
    leerTodo<FilaProgreso>('sesiones', (desde, hasta) =>
      supabase
        .from('v_sesion_calculada')
        .select('id, fecha, tipo, modalidad, distancia_m, tiempo_ds, spm_promedio')
        .eq('atleta_id', atletaId)
        .eq('verificado', true)
        .order('fecha', { ascending: true })
        .order('id')
        .range(desde, hasta),
    ),
    supabase
      .from('v_sesion_calculada')
      .select('id', { count: 'exact', head: true })
      .eq('atleta_id', atletaId)
      .eq('verificado', false),
  ])
  if (error) throw new Error(`sesiones: ${error.message}`)
  return { filas, sinVerificar: count ?? 0 }
}
