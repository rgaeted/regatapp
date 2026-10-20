import { z } from 'zod'

const entero = z.number().int()
const positivo = entero.positive()

export const splitInputSchema = z.object({
  orden: positivo,
  distancia_m: positivo.optional(),
  tiempo_ds: positivo,
  spm: z.number().positive().max(99.9).optional(),
  fc: positivo.optional(),
})

export const sesionInputSchema = z
  .object({
    id: z.uuid(),
    atleta_id: z.uuid(),
    tipo: z.enum(['entrenamiento', 'test', 'competencia']),
    modalidad: z.enum(['ergometro', 'agua', 'gimnasio', 'otro']).default('ergometro'),
    fecha: z.iso.datetime(),
    distancia_m: positivo.optional(),
    tiempo_ds: positivo.optional(),
    spm_promedio: z.number().positive().max(99.9).optional(),
    fc_promedio: positivo.optional(),
    fc_maxima: positivo.optional(),
    calorias: positivo.optional(),
    factor_arrastre: positivo.optional(),
    rpe: entero.min(1).max(10).optional(),
    descripcion: z.string().trim().min(1).optional(),
    notas: z.string().trim().min(1).optional(),
    splits: z.array(splitInputSchema),
  })
  .superRefine((v, ctx) => {
    const ordenes = v.splits.map((s) => s.orden)
    if (new Set(ordenes).size !== ordenes.length) {
      ctx.addIssue({ code: 'custom', path: ['splits'], message: 'Orden de splits repetido' })
    }
  })

export type SesionInput = z.infer<typeof sesionInputSchema>
