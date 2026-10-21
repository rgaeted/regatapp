import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MARCA, contraste } from '@/lib/marca'
import manifest from '@/app/manifest'

describe('contraste (WCAG)', () => {
  it('blanco sobre negro es 21 y sobre sí mismo es 1', () => {
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 0)
    expect(contraste('#123456', '#123456')).toBeCloseTo(1, 5)
  })
})

describe('paleta del club: pares de color legibles', () => {
  // [texto, fondo, mínimo, dónde se usa]
  const pares: [string, string, number, string][] = [
    [MARCA.marino, MARCA.papel, 7, 'texto y títulos sobre el papel'],
    [MARCA.blanco, MARCA.marino, 7, 'botón principal y cabecera'],
    [MARCA.marino, MARCA.turquesaClaro, 7, 'botón secundario'],
    [MARCA.turquesaOscuro, MARCA.papel, 4.5, 'enlaces, etiquetas y la línea de los gráficos'],
    [MARCA.pala, MARCA.papel, 4.5, 'marca personal (texto)'],
    [MARCA.pala, MARCA.palaClara, 4.5, 'insignia de mejor marca'],
    [MARCA.turquesaClaro, MARCA.marino, 7, 'subtítulo del club en la cabecera'],
    [MARCA.blanco, MARCA.marino900, 7, 'pantalla de entrada'],
  ]
  it.each(pares)('%s sobre %s ≥ %s (%s)', (texto, fondo, minimo) => {
    expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(minimo)
  })

  it('las líneas y marcas gráficas pasan 3:1 contra el papel y el blanco', () => {
    for (const marca of [MARCA.turquesaOscuro, MARCA.pala, MARCA.marino]) {
      expect(contraste(marca, MARCA.papel)).toBeGreaterThanOrEqual(3)
      expect(contraste(marca, MARCA.blanco)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('la paleta de lib/marca.ts es la misma que usan el CSS y la PWA', () => {
  const css = readFileSync('app/globals.css', 'utf8').toLowerCase()
  const layout = readFileSync('app/layout.tsx', 'utf8').toLowerCase()

  // El blanco es el de Tailwind y no se redefine como token.
  it.each(Object.entries(MARCA).filter(([n]) => n !== 'blanco'))('globals.css define %s = %s', (_nombre, hex) => {
    expect(css).toContain(hex.toLowerCase())
  })

  it('el manifest y el color de la barra del navegador son el marino del club', () => {
    const m = manifest()
    expect(m.background_color).toBe(MARCA.marino)
    expect(m.theme_color).toBe(MARCA.marino)
    expect(layout).toContain(`themecolor: "${MARCA.marino.toLowerCase()}"`)
  })
})
