import { describe, expect, it } from 'vitest'
import { opcionesInicio } from '@/lib/inicio'

const hrefs = (rol: Parameters<typeof opcionesInicio>[0]) => opcionesInicio(rol).map((o) => o.href)

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

  it('"Foto del ergómetro" está activa y es el botón principal para todos', () => {
    for (const rol of ['remero', 'entrenador', 'admin'] as const) {
      const foto = opcionesInicio(rol).find((o) => o.texto === 'Foto del ergómetro')
      expect(foto).toMatchObject({ activo: true, principal: true, href: '/foto' })
    }
  })
})
