/** La lectura automática funciona solo si el servidor tiene la clave del modelo. */
export function ocrDisponible(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY)
}

/** Lecturas por usuario y día: cada foto nueva es una llamada de pago al modelo. */
export const LIMITE_DIARIO = 40
