import type { AtletaInput } from '@/lib/schemas/atleta'

/** Texto de un campo del formulario; vacío → undefined. */
function campo(fd: FormData, nombre: string): string | undefined {
  const v = fd.get(nombre)
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t === '' ? undefined : t
}

/** Número con coma o punto decimal; ilegible → NaN (el esquema lo rechaza). */
function numero(fd: FormData, nombre: string): number | undefined {
  const t = campo(fd, nombre)
  return t === undefined ? undefined : Number(t.replace(',', '.'))
}

/** Solo las claves con valor: el esquema no distingue "ausente" de "undefined", pero los tests sí. */
function sinUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/** Datos del atleta desde el formulario (alta y edición). Sin validar: eso lo hace el esquema. */
export function formDataAAtleta(fd: FormData): Partial<Record<keyof AtletaInput, unknown>> {
  return sinUndefined({
    nombre: campo(fd, 'nombre'),
    apellido: campo(fd, 'apellido'),
    fecha_nacimiento: campo(fd, 'fecha_nacimiento'),
    sexo: campo(fd, 'sexo'),
    peso_kg: numero(fd, 'peso_kg'),
    altura_cm: numero(fd, 'altura_cm'),
    categoria_peso: campo(fd, 'categoria_peso'),
  })
}

/** Alta completa: atleta + consentimiento, para `altaAtletaSchema`. */
export function formDataAAlta(fd: FormData) {
  return {
    atleta: formDataAAtleta(fd),
    consentimiento: sinUndefined({
      otorgado_por_nombre: campo(fd, 'c_nombre'),
      otorgado_por_rut: campo(fd, 'c_rut'),
      relacion: campo(fd, 'c_relacion'),
      medio: campo(fd, 'c_medio'),
      version_texto: campo(fd, 'c_version'),
      otorgado_en: campo(fd, 'c_fecha'),
    }),
  }
}

const ETIQUETAS: Record<string, string> = {
  fecha_nacimiento: 'fecha de nacimiento',
  peso_kg: 'peso',
  altura_cm: 'altura',
  categoria_peso: 'categoría de peso',
  otorgado_por_nombre: 'nombre de quien autoriza',
  otorgado_por_rut: 'RUT',
  relacion: 'relación',
  version_texto: 'versión del texto',
  otorgado_en: 'fecha del consentimiento',
}

/** Mensaje en español para el primer problema de un alta o edición. */
export function mensajeAlta(error: { issues: { code: string; message: string; path: PropertyKey[] }[] }): string {
  const propio = error.issues.find((i) => i.code === 'custom')
  if (propio) return propio.message
  const campos = [
    ...new Set(error.issues.map((i) => String(i.path[i.path.length - 1])).map((c) => ETIQUETAS[c] ?? c)),
  ]
  return `Revisa: ${campos.join(', ')}`
}
