import { sesionInputSchema, type SesionInput } from '@/lib/schemas/sesion'
import { digitosATiempo } from './digitos'
import { repartirSplits } from './splits'

/** Estado crudo del formulario: todo texto, tal como lo tipea la persona. */
export type EstadoFormulario = {
  id: string
  atletaId: string
  tipo: SesionInput['tipo']
  modalidad: SesionInput['modalidad']
  fecha: string
  distancia: string
  tiempoDigitos: string
  nSplits: number
  splitsDigitos: string[]
  extras: {
    spm: string
    fcPromedio: string
    fcMaxima: string
    calorias: string
    drag: string
    rpe: string
    descripcion: string
    notas: string
  }
}

export type ResultadoArmado =
  | { ok: true; input: SesionInput }
  | { ok: false; errores: Record<string, string> }

export function estadoInicial(id: string, atletaId: string, ahora: Date): EstadoFormulario {
  return {
    id,
    atletaId,
    tipo: 'entrenamiento',
    modalidad: 'ergometro',
    fecha: ahora.toISOString(),
    distancia: '',
    tiempoDigitos: '',
    nSplits: 0,
    splitsDigitos: [],
    extras: { spm: '', fcPromedio: '', fcMaxima: '', calorias: '', drag: '', rpe: '', descripcion: '', notas: '' },
  }
}

/** '' → undefined; número válido → número; otra cosa → NaN. */
function numero(texto: string): number | undefined {
  const t = texto.trim().replace(',', '.')
  if (t === '') return undefined
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN
}

function texto(t: string): string | undefined {
  const v = t.trim()
  return v === '' ? undefined : v
}

/** Convierte el estado del formulario en el input validado de `guardarSesion`. */
export function armarSesionInput(e: EstadoFormulario): ResultadoArmado {
  const errores: Record<string, string> = {}

  if (!e.atletaId) errores.atleta = 'Elige un atleta'

  const distancia = numero(e.distancia)
  if (distancia !== undefined && !(Number.isInteger(distancia) && distancia > 0)) {
    errores.distancia = 'Distancia inválida'
  }

  let tiempo: number | undefined
  if (e.tiempoDigitos !== '') {
    const t = digitosATiempo(e.tiempoDigitos)
    if (t === null) errores.tiempo = 'Tiempo inválido'
    else tiempo = t
  }

  // Splits: todos con tiempo, o ninguno. Nunca a medias.
  const crudos = e.splitsDigitos.slice(0, e.nSplits)
  const llenos = crudos.filter((d) => d !== '')
  const splits: SesionInput['splits'] = []
  if (llenos.length > 0) {
    if (llenos.length < e.nSplits) {
      errores.splits = 'Faltan tiempos en splits'
    } else {
      const distancias =
        distancia !== undefined && Number.isInteger(distancia) ? repartirSplits(distancia, e.nSplits) : []
      crudos.forEach((d, i) => {
        const t = digitosATiempo(d)
        if (t === null) errores.splits = 'Tiempo inválido en un split'
        else splits.push({ orden: i + 1, distancia_m: distancias[i], tiempo_ds: t })
      })
    }
  }

  const x = e.extras
  const campos = {
    spm_promedio: numero(x.spm),
    fc_promedio: numero(x.fcPromedio),
    fc_maxima: numero(x.fcMaxima),
    calorias: numero(x.calorias),
    factor_arrastre: numero(x.drag),
    rpe: numero(x.rpe),
  }
  const nombres: Record<keyof typeof campos, string> = {
    spm_promedio: 'spm',
    fc_promedio: 'fcPromedio',
    fc_maxima: 'fcMaxima',
    calorias: 'calorias',
    factor_arrastre: 'drag',
    rpe: 'rpe',
  }
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor !== undefined && Number.isNaN(valor)) errores[nombres[clave as keyof typeof campos]] = 'Número inválido'
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores }

  const candidato = {
    id: e.id,
    atleta_id: e.atletaId,
    tipo: e.tipo,
    modalidad: e.modalidad,
    fecha: e.fecha,
    distancia_m: distancia,
    tiempo_ds: tiempo,
    ...campos,
    descripcion: texto(x.descripcion),
    notas: texto(x.notas),
    splits,
  }
  const r = sesionInputSchema.safeParse(candidato)
  if (!r.success) {
    const resto: Record<string, string> = {}
    for (const i of r.error.issues) resto[String(i.path[0] ?? 'general')] ??= i.message
    return { ok: false, errores: resto }
  }
  return { ok: true, input: r.data }
}
