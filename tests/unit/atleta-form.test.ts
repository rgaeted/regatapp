import { describe, expect, it } from 'vitest'
import { formDataAAlta, formDataAAtleta, mensajeAlta } from '@/lib/atletas/formulario'
import { altaAtletaSchema } from '@/lib/schemas/consentimiento'

function fd(campos: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}

const valido = {
  nombre: 'Ana',
  apellido: 'Pérez',
  fecha_nacimiento: '2011-05-01',
  peso_kg: '',
  altura_cm: '',
  sexo: '',
  categoria_peso: '',
  c_nombre: 'María Pérez',
  c_rut: '',
  c_relacion: 'apoderado',
  c_medio: 'papel',
  c_version: 'v1',
  c_fecha: '2026-10-01',
}

describe('formDataAAlta', () => {
  it('peso, altura y sexo vacíos quedan ausentes, no en cero', () => {
    const { atleta, consentimiento } = formDataAAlta(fd(valido))
    expect(atleta).toEqual({ nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '2011-05-01' })
    expect(consentimiento.otorgado_por_rut).toBeUndefined()
    expect(altaAtletaSchema.safeParse({ atleta, consentimiento }).success).toBe(true)
  })

  it('convierte números, incluida la coma decimal', () => {
    const { atleta } = formDataAAlta(fd({ ...valido, peso_kg: '55,5', altura_cm: '170', sexo: 'F', categoria_peso: 'ligero' }))
    expect(atleta).toMatchObject({ peso_kg: 55.5, altura_cm: 170, sexo: 'F', categoria_peso: 'ligero' })
  })

  it('menor con relación propio es rechazado por el esquema', () => {
    const r = altaAtletaSchema.safeParse(formDataAAlta(fd({ ...valido, c_relacion: 'propio' })))
    expect(r.success).toBe(false)
    expect(!r.success && r.error.issues[0].path).toEqual(['consentimiento', 'relacion'])
  })

  it('fecha de consentimiento vacía es rechazada', () => {
    const r = altaAtletaSchema.safeParse(formDataAAlta(fd({ ...valido, c_fecha: '' })))
    expect(r.success).toBe(false)
  })

  it('un número ilegible no se convierte en cero: llega como NaN y el esquema lo rechaza', () => {
    const r = altaAtletaSchema.safeParse(formDataAAlta(fd({ ...valido, peso_kg: 'abc' })))
    expect(r.success).toBe(false)
  })
})

describe('formDataAAtleta (edición)', () => {
  it('devuelve solo los campos del atleta', () => {
    expect(formDataAAtleta(fd(valido))).toEqual({ nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '2011-05-01' })
  })
})

describe('mensajeAlta', () => {
  it('nombra los campos con problemas en español', () => {
    const r = altaAtletaSchema.safeParse(formDataAAlta(fd({ ...valido, nombre: '', peso_kg: 'abc' })))
    expect(!r.success && mensajeAlta(r.error)).toBe('Revisa: nombre, peso')
  })

  it('usa el mensaje propio de las reglas de negocio', () => {
    const r = altaAtletaSchema.safeParse(formDataAAlta(fd({ ...valido, c_relacion: 'propio' })))
    expect(!r.success && mensajeAlta(r.error)).toContain('mayores de 18')
  })
})
