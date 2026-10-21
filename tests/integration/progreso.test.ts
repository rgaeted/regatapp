import { afterAll, describe, expect, it } from 'vitest'
import { cargarProgreso } from '@/lib/progreso/cargar'
import { recordsPorDistancia } from '@/lib/progreso/calculos'
import { admin, asignar, crearAtleta, crearUsuario, limpiar } from './helpers'

afterAll(limpiar)

type Fila = { atleta_id: string; tipo: string; fecha: string; distancia_m: number; tiempo_ds: number; verificado: boolean; origen: string }

async function insertar(filas: Fila[]): Promise<void> {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin().from('sesion').insert(filas.slice(i, i + 500))
    expect(error).toBeNull()
  }
}

const fila = (atleta_id: string, extra: Partial<Fila> = {}): Fila => ({
  atleta_id, tipo: 'test', fecha: '2026-10-01T15:00:00Z', distancia_m: 2000, tiempo_ds: 4555, verificado: true, origen: 'manual', ...extra,
})

describe('cargarProgreso', () => {
  it('solo trae las verificadas y cuenta las que quedaron fuera', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atleta = await crearAtleta()
    await asignar(ent.id, atleta)
    await insertar([
      fila(atleta),
      fila(atleta, { fecha: '2026-10-02T15:00:00Z', tiempo_ds: 4400 }),
      // Un "2:01.3" mal leído por OCR y sin confirmar no puede contaminar el récord.
      fila(atleta, { fecha: '2026-10-03T15:00:00Z', tiempo_ds: 4000, verificado: false, origen: 'ocr_foto' }),
    ])
    const { filas, sinVerificar } = await cargarProgreso(ent.cliente, atleta)
    expect(filas).toHaveLength(2)
    expect(sinVerificar).toBe(1)
    expect(recordsPorDistancia(filas)[0].tiempo_ds).toBe(4400)
  })

  it('un entrenador no asignado recibe cero filas', async () => {
    const duenio = await crearUsuario({ rol: 'entrenador' })
    const otro = await crearUsuario({ rol: 'entrenador' })
    const atleta = await crearAtleta()
    await asignar(duenio.id, atleta)
    await insertar([fila(atleta)])
    expect(await cargarProgreso(otro.cliente, atleta)).toEqual({ filas: [], sinVerificar: 0 })
  })

  it('un remero ve su progreso y no el de otro atleta', async () => {
    const propio = await crearAtleta()
    const ajeno = await crearAtleta()
    const remero = await crearUsuario({ rol: 'remero', atletaId: propio })
    await insertar([fila(propio), fila(ajeno)])
    expect((await cargarProgreso(remero.cliente, propio)).filas).toHaveLength(1)
    expect((await cargarProgreso(remero.cliente, ajeno)).filas).toHaveLength(0)
  })

  it('pagina: trae más de 1000 sesiones sin cortarse', async () => {
    const ent = await crearUsuario({ rol: 'entrenador' })
    const atleta = await crearAtleta()
    await asignar(ent.id, atleta)
    const muchas = Array.from({ length: 1005 }, (_, i) =>
      fila(atleta, { fecha: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(), tiempo_ds: 4500 + (i % 50) }),
    )
    await insertar(muchas)
    const { filas } = await cargarProgreso(ent.cliente, atleta)
    expect(filas).toHaveLength(1005)
    expect(new Set(filas.map((f) => f.id)).size).toBe(1005) // sin duplicados entre páginas
  })
})

