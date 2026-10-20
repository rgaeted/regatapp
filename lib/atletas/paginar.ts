const TAM_PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * PostgREST corta en silencio en `max_rows` (1000), también con service role.
 * Pide páginas sucesivas hasta agotar. La consulta debe tener un orden estable.
 */
export async function leerTodo<T>(contexto: string, pagina: (desde: number, hasta: number) => Pagina<T>): Promise<T[]> {
  const todo: T[] = []
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAM_PAGINA - 1)
    if (error) throw new Error(`${contexto}: ${error.message}`)
    const filas = data ?? []
    todo.push(...filas)
    if (filas.length < TAM_PAGINA) return todo
  }
}

/** Trozos de largo fijo, para no armar URLs con cientos de ids en un `in (...)`. */
export function lotes<T>(items: T[], tam: number): T[][] {
  const r: T[][] = []
  for (let i = 0; i < items.length; i += tam) r.push(items.slice(i, i + tam))
  return r
}
