import { describe, expect, it } from 'vitest'
import { altaAtletaSchema, consentimientoSchema, relacionPermitida } from '@/lib/schemas/consentimiento'
import { atletaSchema } from '@/lib/schemas/atleta'

const hoy = new Date('2026-10-20T15:00:00Z') // 12:00 en Santiago

describe('relacionPermitida', () => {
  it('sin fecha de nacimiento, propio no se permite', () => {
    expect(relacionPermitida(null, 'propio', hoy)).toBe(false)
  })
  it('menor de edad: propio no', () => {
    expect(relacionPermitida('2010-05-01', 'propio', hoy)).toBe(false)
  })
  it('cumple 18 ese día: propio sí', () => {
    expect(relacionPermitida('2008-10-20', 'propio', hoy)).toBe(true)
  })
  it('cumple 18 mañana: propio no', () => {
    expect(relacionPermitida('2008-10-21', 'propio', hoy)).toBe(false)
  })
  it('usa la fecha de Santiago, no la UTC', () => {
    // 01:00 UTC del 21 = 22:00 del 20 en Santiago
    const tarde = new Date('2026-10-21T01:00:00Z')
    expect(relacionPermitida('2008-10-21', 'propio', tarde)).toBe(false)
    expect(relacionPermitida('2008-10-20', 'propio', tarde)).toBe(true)
  })
  it('nacido un 29 de febrero cumple 18 el 1 de marzo (como age() de Postgres)', () => {
    expect(relacionPermitida('2008-02-29', 'propio', new Date('2026-02-28T15:00:00Z'))).toBe(false)
    expect(relacionPermitida('2008-02-29', 'propio', new Date('2026-03-01T15:00:00Z'))).toBe(true)
  })
  it('apoderado y tutor_legal siempre', () => {
    expect(relacionPermitida(null, 'apoderado', hoy)).toBe(true)
    expect(relacionPermitida('2015-01-01', 'tutor_legal', hoy)).toBe(true)
    expect(relacionPermitida('1990-01-01', 'apoderado', hoy)).toBe(true)
  })
})

const consentimientoOk = {
  otorgado_por_nombre: 'Ana Pérez',
  relacion: 'apoderado',
  medio: 'papel',
  version_texto: 'v1',
  otorgado_en: '2026-01-01',
}

describe('consentimientoSchema', () => {
  it('acepta un consentimiento válido', () => {
    expect(consentimientoSchema.safeParse(consentimientoOk).success).toBe(true)
  })
  it.each([
    { otorgado_por_nombre: '  ' },
    { version_texto: '' },
    { relacion: 'amigo' },
    { medio: 'verbal' },
    { otorgado_en: '01/01/2026' },
    { otorgado_en: '2999-01-01' },
  ])('rechaza %j', (cambio) => {
    expect(consentimientoSchema.safeParse({ ...consentimientoOk, ...cambio }).success).toBe(false)
  })
})

describe('atletaSchema', () => {
  it('recorta nombre y apellido', () => {
    const r = atletaSchema.parse({ nombre: '  Juan ', apellido: ' Soto  ' })
    expect(r.nombre).toBe('Juan')
    expect(r.apellido).toBe('Soto')
  })
  it('rechaza sexo inválido', () => {
    expect(atletaSchema.safeParse({ nombre: 'a', apellido: 'b', sexo: 'Z' }).success).toBe(false)
  })
})

describe('altaAtletaSchema', () => {
  it('rechaza nombre en blanco', () => {
    const r = altaAtletaSchema.safeParse({
      atleta: { nombre: '  ', apellido: 'Soto' },
      consentimiento: consentimientoOk,
    })
    expect(r.success).toBe(false)
  })
  it('rechaza propio para un menor', () => {
    const r = altaAtletaSchema.safeParse({
      atleta: { nombre: 'Juan', apellido: 'Soto', fecha_nacimiento: '2012-01-01' },
      consentimiento: { ...consentimientoOk, relacion: 'propio' },
    })
    expect(r.success).toBe(false)
  })
  it('rechaza propio sin fecha de nacimiento', () => {
    const r = altaAtletaSchema.safeParse({
      atleta: { nombre: 'Juan', apellido: 'Soto' },
      consentimiento: { ...consentimientoOk, relacion: 'propio' },
    })
    expect(r.success).toBe(false)
  })
  it('acepta propio para un adulto', () => {
    const r = altaAtletaSchema.safeParse({
      atleta: { nombre: 'Juan', apellido: 'Soto', fecha_nacimiento: '1990-01-01' },
      consentimiento: { ...consentimientoOk, relacion: 'propio' },
    })
    expect(r.success).toBe(true)
  })
})
