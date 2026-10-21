# Fase 3 — Progreso: plan de implementación

> **For agentic workers:** superpowers:executing-plans (inline). Steps con checkbox.

**Goal:** Que cada remero vea su progreso y el entrenador el de sus atletas: récords personales por distancia, curva de split /500 por distancia y volumen semanal, **solo con sesiones `verificado = true`**.

**Architecture:** Una consulta paginada a `v_sesion_calculada` (RLS por `security_invoker`) trae las sesiones verificadas del atleta; funciones puras en `lib/progreso/` calculan récords, series y volumen; gráficos SVG propios (sin librería) con tabla de respaldo. Página `/progreso` (propio, o `?atleta=` para staff).

**Spec:** `AGENTS.md` §7 fase 3 y §5 (sin verificar fuera de récords y curvas); diseño §5.2 (registro de accesos), §8.

## Global Constraints
- Solo `verificado = true` en récords, curvas y volumen. Se informa cuántas sesiones sin verificar quedaron fuera.
- Sin dependencias nuevas: gráficos en SVG a mano siguiendo la guía de dataviz (una serie = un color, sin leyenda, marcas finas, línea de 2 px, puntos ≥ 8 px con anillo del color de fondo, cuadrícula tenue, valores solo en puntos clave, tabla de respaldo, lectura al tocar).
- Tiempos en décimas; split y watts se derivan (`split500`, `watts` de `lib/tiempo.ts`), nunca se guardan.
- Récords y curvas solo de **ergómetro** (tiempos de agua y de ergómetro no se comparan); el volumen cuenta todos los metros verificados.
- Semanas lunes–domingo en hora de Santiago.
- Un tercero que mira el progreso de un atleta queda en `registro_acceso` (`ver_progreso`).
- Interfaz en español; texto ≥ 18 px; la app es de tema claro (se elimina el oscurecimiento automático del fondo, que dejaba el texto ilegible).

## Review Focus
1. Atleta sin sesiones verificadas, o solo con sin verificar: estado vacío claro, sin gráficos rotos.
2. Una sola sesión en una distancia: hay récord pero no curva.
3. Distancias con muchas sesiones: la curva usa la distancia más frecuente por defecto.
4. Semana con 0 metros: se muestra como hueco, no desaparece.
5. Más de 1000 sesiones: la consulta pagina (PostgREST corta en 1000).

## Tasks
### Task 1: Cálculos puros (`lib/progreso/calculos.ts`)
- [ ] Tests (`tests/unit/progreso.test.ts`): `recordsPorDistancia`, `distanciasConCurva`, `serieSplit` (marca récord progresivo), `volumenSemanal` (lunes de Santiago, huecos en 0, ventana de N semanas), `ticksBonitos`. Ignoran modalidades ≠ ergómetro (excepto volumen), filas sin distancia/tiempo, y empates (gana el más antiguo).
- [ ] Implementar. Commit.

### Task 2: Consulta, página y acceso
- [ ] `cargarProgreso(supabase, atletaId)` (pagina; cuenta sin verificar). Página `/progreso` con selector de atleta para staff, estado vacío, registro de acceso. Test del estado vacío en la función pura `resumenProgreso`.

### Task 3: Gráficos
- [ ] `components/graficos/curva-split.tsx` y `barras-volumen.tsx` (cliente: lectura al tocar), tabla `<details>`.

### Task 4: Navegación, tema claro y despliegue
- [ ] Botón "Progreso" en el inicio (`opcionesInicio`), enlaces desde sesiones y ficha. `globals.css` sin modo oscuro. Deploy.
