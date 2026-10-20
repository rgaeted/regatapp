/** Reparte la distancia en n partes; el último split absorbe el resto. */
export function repartirSplits(distancia_m: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(distancia_m) || distancia_m < 1) return []
  const base = Math.floor(distancia_m / n)
  const partes = Array<number>(n).fill(base)
  partes[n - 1] = distancia_m - base * (n - 1)
  return partes
}

/** Suma de los splits menos el total: 0 si cuadran. */
export function diferenciaSuma(tiempos_ds: number[], total_ds: number): number {
  return tiempos_ds.reduce((a, b) => a + b, 0) - total_ds
}
