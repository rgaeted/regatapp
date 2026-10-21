import { describe, expect, it } from 'vitest'
import { escalarA, rutaCapturaValida, tipoDeRuta } from '@/lib/ocr/imagen'

const UID = '11111111-1111-4111-8111-111111111111'
const OTRO = '33333333-3333-4333-8333-333333333333'
const ARCHIVO = '22222222-2222-4222-8222-222222222222'

describe('escalarA', () => {
  it('reduce al lado mayor manteniendo proporción', () => {
    expect(escalarA(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 })
    expect(escalarA(3000, 4000, 1600)).toEqual({ ancho: 1200, alto: 1600 })
  })
  it('no agranda una imagen pequeña', () => {
    expect(escalarA(800, 600, 1600)).toEqual({ ancho: 800, alto: 600 })
  })
  it('redondea a enteros y nunca da 0', () => {
    const r = escalarA(5000, 1, 1600)
    expect(Number.isInteger(r.ancho) && Number.isInteger(r.alto)).toBe(true)
    expect(r.alto).toBeGreaterThanOrEqual(1)
  })
})

describe('rutaCapturaValida', () => {
  it('acepta <uid>/<uuid>.<ext> propio', () => {
    expect(rutaCapturaValida(`${UID}/${ARCHIVO}.jpg`, UID)).toBe(true)
    expect(rutaCapturaValida(`${UID}/${ARCHIVO}.png`, UID)).toBe(true)
    expect(rutaCapturaValida(`${UID}/${ARCHIVO}.webp`, UID)).toBe(true)
  })
  it.each([
    [`${OTRO}/${ARCHIVO}.jpg`, 'carpeta de otro usuario'],
    [`${UID}/../${OTRO}/${ARCHIVO}.jpg`, 'recorrido con ..'],
    [`${UID}/${ARCHIVO}.gif`, 'extensión no admitida'],
    [`${UID}/sub/${ARCHIVO}.jpg`, 'subcarpeta'],
    [`${UID}/archivo.jpg`, 'nombre que no es uuid'],
    [`/${UID}/${ARCHIVO}.jpg`, 'ruta absoluta'],
    ['', 'vacía'],
  ])('rechaza %s (%s)', (ruta) => {
    expect(rutaCapturaValida(ruta, UID)).toBe(false)
  })
})

describe('tipoDeRuta', () => {
  it('deduce el tipo de imagen de la extensión', () => {
    expect(tipoDeRuta(`${UID}/${ARCHIVO}.jpg`)).toBe('image/jpeg')
    expect(tipoDeRuta(`${UID}/${ARCHIVO}.png`)).toBe('image/png')
    expect(tipoDeRuta(`${UID}/${ARCHIVO}.webp`)).toBe('image/webp')
  })
})
