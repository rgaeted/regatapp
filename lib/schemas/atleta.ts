import { z } from 'zod'

const texto = z.string().trim().min(1)

export const atletaSchema = z.object({
  nombre: texto,
  apellido: texto,
  fecha_nacimiento: z.iso.date().optional(),
  sexo: z.enum(['M', 'F', 'X']).optional(),
  peso_kg: z.number().positive().max(999.99).optional(),
  altura_cm: z.number().int().positive().max(300).optional(),
  categoria_peso: z.enum(['ligero', 'abierto']).optional(),
})

export type AtletaInput = z.infer<typeof atletaSchema>
