import { describe, expect, it } from 'vitest'
import { opcionesInicio } from '@/lib/inicio'

const hrefs = (rol: Parameters<typeof opcionesInicio>[0]) => opcionesInicio(rol, true).map((o) => o.href)

describe('opcionesInicio', () => {
  it('el remero no ve atletas ni entrenadores', () => {
    expect(hrefs('remero')).toEqual(expect.arrayContaining(['/sesion/nueva', '/sesiones']))
    expect(hrefs('remero')).not.toContain('/atletas')
    expect(hrefs('remero')).not.toContain('/entrenadores')
  })

  it('el entrenador ve atletas pero no entrenadores', () => {
    expect(hrefs('entrenador')).toContain('/atletas')
    expect(hrefs('entrenador')).not.toContain('/entrenadores')
  })

  it('el admin ve ambos', () => {
    expect(hrefs('admin')).toEqual(expect.arrayContaining(['/atletas', '/entrenadores']))
  })

  it('con lectura automática disponible, "Foto del ergómetro" es el botón principal', () => {
    for (const rol of ['remero', 'entrenador', 'admin'] as const) {
      const o = opcionesInicio(rol, true)
      expect(o.find((x) => x.texto === 'Foto del ergómetro')).toMatchObject({ activo: true, principal: true, href: '/foto' })
      expect(o.find((x) => x.texto === 'Cargar a mano')?.principal).toBe(false)
    }
  })

  it('sin lectura automática, la foto queda deshabilitada y cargar a mano es lo principal', () => {
    for (const rol of ['remero', 'entrenador', 'admin'] as const) {
      const o = opcionesInicio(rol, false)
      expect(o.find((x) => x.texto === 'Foto del ergómetro')?.activo).toBe(false)
      expect(o.find((x) => x.texto === 'Cargar a mano')).toMatchObject({ activo: true, principal: true })
    }
  })
})
