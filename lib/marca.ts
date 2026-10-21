/**
 * Paleta del Coastal Rowing Club · Colegio Patagonia, tomada del escudo
 * (marino #183243, turquesa #2fa2ac, rojo de las palas #bc2c3d). Es la única
 * fuente para el código (PWA, gráficos); `app/globals.css` repite los mismos
 * valores como tokens y un test comprueba que no se desalineen.
 */
export const MARCA = {
  marino: '#183243', // estructura: cabecera, botón principal, texto
  marino900: '#0a1c2b', // fondo más profundo (pantalla de entrada)
  papel: '#f4f9fa', // fondo de la app: un blanco con un toque de agua
  turquesa: '#2fa2ac', // el aro del escudo: líneas y marcas (no para texto)
  turquesaOscuro: '#1a7a85', // el turquesa cuando debe leerse como texto o línea de datos
  turquesaClaro: '#d9f0f2', // botón secundario y fondos suaves
  pala: '#bc2c3d', // las palas rojas: solo marcas personales y lo que merece atención
  palaClara: '#f9e3e6',
  blanco: '#ffffff',
} as const

function canal(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminancia(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

/** Relación de contraste WCAG entre dos colores #rrggbb (1 a 21). */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (oscuro + 0.05)
}
