/** Dos letras para el avatar: la inicial del nombre y la del apellido (o de la última palabra). */
export function iniciales(nombre: string, apellido: string): string {
  const palabras = `${nombre} ${apellido}`.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'
  const primera = nombre.trim().split(/\s+/)[0] || palabras[0]
  const ultima = apellido.trim() ? apellido.trim().split(/\s+/)[0] : palabras.length > 1 ? palabras[palabras.length - 1] : ''
  return `${primera[0]}${ultima ? ultima[0] : ''}`.toLocaleUpperCase('es-CL')
}
