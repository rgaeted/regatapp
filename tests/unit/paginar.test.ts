import { describe, expect, it } from 'vitest'
import { leerTodo, lotes } from '@/lib/atletas/paginar'

function fuente(total: number) {
  const filas = Array.from({ length: total }, (_, i) => ({ n: i }))
  const llamadas: [number, number][] = []
  return {
    llamadas,
    pagina: async (desde: number, hasta: number) => {
      llamadas.push([desde, hasta])
      return { data: filas.slice(desde, hasta + 1), error: null }
    },
  }
}

describe('leerTodo', () => {
  it('trae más de 1000 filas pidiendo páginas sucesivas', async () => {
    const f = fuente(2500)
    const r = await leerTodo('x', f.pagina)
    expect(r).toHaveLength(2500)
    expect(f.llamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it('con exactamente un múltiplo de la página pide una más y termina', async () => {
    const f = fuente(1000)
    expect(await leerTodo('x', f.pagina)).toHaveLength(1000)
    expect(f.llamadas).toHaveLength(2)
  })
  it('sin filas devuelve arreglo vacío', async () => {
    expect(await leerTodo('x', fuente(0).pagina)).toEqual([])
  })
  it('lanza si una página falla', async () => {
    await expect(leerTodo('split', async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('split: boom')
  })
})

describe('lotes', () => {
  it('parte una lista en trozos', () => {
    expect(lotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(lotes([], 2)).toEqual([])
  })
})
