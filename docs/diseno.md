# Identidad visual — Coastal Rowing Club · Colegio Patagonia

Tomada del escudo (`public/logo-club.png`, 150 px: conviene reemplazarlo por un archivo de mayor
resolución, idealmente SVG, para que los íconos de la PWA salgan nítidos).

**Dirección:** bitácora náutica de club costero. Fondo papel con un toque de agua, marino profundo
como estructura, turquesa como línea de agua y el rojo de las palas reservado para lo que marca una
marca personal.

| Token | Valor | Uso |
| --- | --- | --- |
| marino | `#183243` (`zinc-900`) | cabecera, botón principal, texto |
| marino profundo | `#0a1c2b` (`zinc-950`) | portada de las pantallas de entrada |
| papel | `#f4f9fa` | fondo de la app |
| turquesa | `#2fa2ac` (`mar-500`) | línea de agua bajo la cabecera, aro del avatar, títulos de sección |
| turquesa oscuro | `#1a7a85` (`mar-700`) | enlaces, etiquetas y la línea de los gráficos (legible como texto) |
| turquesa claro | `#d9f0f2` (`mar-100`) | botones secundarios |
| pala | `#bc2c3d` (`pala-600`) | récords personales; nunca decoración |

- La paleta vive en `lib/marca.ts` y en `app/globals.css`. `tests/unit/marca.test.ts` comprueba que
  coincidan y que los pares de color cumplan WCAG (7:1 en texto principal, 4,5:1 en el resto).
- La escala `zinc` de Tailwind se redefinió con grises azulados del marino: los componentes existentes
  toman la marca sin cambiar cada clase.
- **Elemento propio:** el aro turquesa del escudo como avatar de cada atleta (`AvatarAnillo`), y la
  pala roja como marcador de récord (lista de récords y punto del récord en la curva).
- Cifras de ancho fijo (`.cifras`) para tiempos y distancias en columna.
- Tema claro fijo; el rojo de error (`red-700`) sigue siendo distinto del rojo de marca.
