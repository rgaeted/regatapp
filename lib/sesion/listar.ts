import type { SupabaseClient } from '@supabase/supabase-js'
import { TZ } from '@/lib/schemas/consentimiento'
import { formatTiempo } from '@/lib/tiempo'

type FilaVista = {
  id: string
  fecha: string
  tipo: string
  distancia_m: number | null
  tiempo_ds: number | null
  spm_promedio: number | null
  split_500_seg: number | null
  watts: number | null
  verificado: boolean
  origen: string
}

export type FilaSesion = {
  id: string
  fecha: string
  tipo: string
  distancia_m: number | null
  tiempo: string
  spm: number | null
  split500: string
  watts: number | null
  verificado: boolean
  origen: string
}

const SIN_DATO = '—'

export function filaSesion(f: FilaVista): FilaSesion {
  return {
    id: f.id,
    fecha: new Date(f.fecha).toLocaleString('es-CL', {
      timeZone: TZ,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    tipo: f.tipo,
    distancia_m: f.distancia_m,
    tiempo: f.tiempo_ds === null ? SIN_DATO : formatTiempo(f.tiempo_ds),
    spm: f.spm_promedio,
    // La vista da segundos con un decimal; formatTiempo trabaja en décimas.
    split500: f.split_500_seg === null ? SIN_DATO : formatTiempo(Math.round(f.split_500_seg * 10)),
    watts: f.watts,
    verificado: f.verificado,
    origen: f.origen,
  }
}

/** Sesiones más recientes de un atleta, desde la vista (RLS por security_invoker). */
export async function listarSesiones(
  supabase: SupabaseClient,
  atletaId: string,
  limite = 50,
): Promise<FilaSesion[]> {
  const { data, error } = await supabase
    .from('v_sesion_calculada')
    .select('id, fecha, tipo, distancia_m, tiempo_ds, spm_promedio, split_500_seg, watts, verificado, origen')
    .eq('atleta_id', atletaId)
    .order('fecha', { ascending: false })
    .limit(limite)
  if (error) throw new Error(`sesiones: ${error.message}`)
  return (data as FilaVista[]).map(filaSesion)
}
