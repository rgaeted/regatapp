export type Rol = 'remero' | 'entrenador' | 'admin'

export type OpcionInicio = {
  texto: string
  href: string
  activo: boolean
  /** Botón principal (oscuro) o secundario. */
  principal: boolean
}

/** Botones de la pantalla de inicio según el rol. */
export function opcionesInicio(rol: Rol, ocrDisponible: boolean): OpcionInicio[] {
  const opciones: OpcionInicio[] = [
    { texto: 'Foto del ergómetro', href: '/foto', activo: ocrDisponible, principal: ocrDisponible },
    { texto: 'Cargar a mano', href: '/sesion/nueva', activo: true, principal: !ocrDisponible },
    { texto: rol === 'remero' ? 'Mis sesiones' : 'Sesiones', href: '/sesiones', activo: true, principal: false },
    { texto: rol === 'remero' ? 'Mi progreso' : 'Progreso', href: '/progreso', activo: true, principal: false },
  ]
  if (rol !== 'remero') opciones.push({ texto: 'Atletas', href: '/atletas', activo: true, principal: false })
  if (rol === 'admin') opciones.push({ texto: 'Entrenadores', href: '/entrenadores', activo: true, principal: false })
  return opciones
}
