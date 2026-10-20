# Fase 1 — Carga manual: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un entrenador (o remero) carga una sesión con 8 splits desde el celular en menos de 30 segundos, y un entrenador administra atletas (alta con consentimiento, enlace de acceso, revocar, exportar, eliminar).

**Architecture:** La lógica de dominio (entrada de tiempos por dígitos, reparto de splits, esquema Zod) es pura y vive en `lib/sesion/`. La sesión y sus splits se guardan en una sola RPC SQL `security invoker` (una transacción, RLS aplica). Las páginas son Server Components; el formulario es un Client Component con una Server Action. Cada página y acción de `(app)` llama a `requerirUsuario()` (ver aviso en `lib/acceso/actual.ts`).

**Tech Stack:** Next.js 16.4 (App Router), React 19, TypeScript estricto, Tailwind 4, Supabase (`@supabase/ssr`), Zod 4, Vitest. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-20-regatapp-design.md` (§2, §4, §5.2, §7, §8) y `AGENTS.md` (§3, §7 fase 1, §9).

## Global Constraints

- Tiempos en décimas de segundo, `integer`; formato `m:ss.d` solo en presentación (`formatTiempo`).
- Una sola tabla `sesion`; split /500 y watts se derivan de `v_sesion_calculada`, nunca se guardan.
- Sesión cargada a mano: `origen = 'manual'`, `verificado = true`. Defaults del formulario: `tipo = 'entrenamiento'`, `modalidad = 'ergometro'`, `fecha = ahora`.
- Chips de distancia: 500, 1000, 2000, 5000, 6000. Chips de splits: 4, 5, 8, "otra". Campos secundarios (spm, FC, calorías, drag, RPE, notas) plegados bajo "Más datos".
- La suma de splits distinta del total es un aviso, nunca un bloqueo.
- Un solo botón "Guardar", fijo abajo en el celular. Texto base ≥ 18 px, botones ≥ 64 px de alto. Interfaz en español de Chile, fechas en `America/Santiago`.
- Todo acceso de un tercero (no el propio atleta) a la ficha o sesiones de un atleta, exportar, eliminar o generar enlace se registra con `registrar_acceso`.
- Eliminar un atleta: solo admin; borra sesiones, splits, consentimientos, enlaces, fotos de Storage y su usuario de Auth; `registro_acceso` queda con `atleta_id = null` más una fila `eliminar`.
- Sin dependencias nuevas; commits en español, uno por unidad coherente.
- Migraciones solo en `supabase/migrations/` (nueva: `20261020000006_…`); las 000001–000005 ya están aplicadas, no se editan.

## Decisión de entorno (cambia respecto de Fase 0)

El usuario decidió **no usar Supabase local: se trabaja directo contra prod**. Consecuencias que este plan asume:

- Los tests de integración existentes tienen una guardia que **se niega a correr contra un host remoto** salvo `ALLOW_REMOTE_TESTS=1` + `SUPABASE_PROJECT_REF`. No se debilita: los tests de integración de este plan **se escriben y se commitean, pero no se ejecutan** hasta que exista un proyecto Supabase solo para pruebas (propuesta: el usuario crea uno "dev" gratis y se usa esa guardia). Mientras tanto la verificación es: tests unitarios, `typecheck`, `lint`, `build` y la prueba manual de la Task 9 con datos reales marcados.
- Las migraciones las aplica el usuario con `npx supabase link` + `npx supabase db push` (no requiere Docker). **Nunca desde el dashboard.** Cada task con migración termina con un paso para el usuario.
- Se prefiere por eso poca SQL nueva (una RPC) y que sea revisable a ojo.

## Estructura de archivos

```
lib/sesion/digitos.ts          entrada de tiempo por dígitos (formatearDigitos, digitosATiempo)
lib/sesion/splits.ts           repartirSplits, diferenciaSuma
lib/schemas/sesion.ts          sesionInputSchema (Zod compartido cliente/servidor)
lib/sesion/guardar.ts          guardarSesion(supabase, input) → llama a la RPC
lib/atletas/lista.ts           atletasVisibles, ultimoAtletaUsado (cookie)
lib/atletas/exportar.ts        exportarAtleta(admin, atletaId)
lib/atletas/eliminar.ts        eliminarAtleta(admin, atletaId)
supabase/migrations/20261020000006_guardar_sesion.sql
app/(app)/sesion/nueva/page.tsx          carga de datos (atletas, defaults)
app/(app)/sesion/nueva/formulario.tsx    Client Component
app/(app)/sesion/nueva/actions.ts        Server Action guardar
app/(app)/sesiones/page.tsx              listado (propio o ?atleta=)
app/(app)/atletas/page.tsx               lista
app/(app)/atletas/nuevo/{page,formulario,actions}.tsx
app/(app)/atletas/[id]/page.tsx          ficha + acciones
app/(app)/atletas/[id]/actions.ts        editar, desactivar, revocar, enlace, exportar, eliminar
app/(app)/entrenadores/{page,actions}.tsx  admin: alta de entrenador y asignación
tests/unit/{digitos,splits,sesion-schema}.test.ts
tests/integration/{guardar-sesion,atletas-admin}.test.ts
```

## Review Focus

Entradas y fallas que el diseño implica pero ninguna tarea nombra; cada una tiene su prueba en la task indicada.

1. **Doble toque en "Guardar" duplica la sesión** (celular lento): el cliente genera el `id` de la sesión una vez; reintentar el mismo `id` devuelve éxito sin duplicar. → Task 2, Task 3.
2. **Distancia no divisible por la cantidad de splits** (2000 m en 3, 1500 en 4): el último split absorbe el resto, la suma de distancias siempre es la total. → Task 1.
3. **Dígitos de más al tipear el tiempo** (más de lo que cabe en `integer`, o pegar `2:07.3` en el campo): se limita el largo; el texto pegado se interpreta con `parseTiempo` en vez de romperse. → Task 1.
4. **Splits a medias** (4 de 8 con tiempo): no se guardan splits parciales; error claro "faltan tiempos" o se descartan solo si todos están vacíos. → Task 1 y 3.
5. **Entrenador sin atletas asignados, o consentimiento revocado a mitad de carga**: mensaje en español en vez de error técnico de RLS. → Task 3 y Task 5.

---

### Task 1: Dominio de la sesión (tiempo por dígitos, splits, esquema)

**Files:**
- Create: `lib/sesion/digitos.ts`, `lib/sesion/splits.ts`, `lib/schemas/sesion.ts`
- Test: `tests/unit/digitos.test.ts`, `tests/unit/splits.test.ts`, `tests/unit/sesion-schema.test.ts`

**Interfaces:**
- Consumes: `parseTiempo`, `formatTiempo` de `lib/tiempo.ts`.
- Produces:
  - `soloDigitos(texto: string): string` — quita no dígitos y ceros a la izquierda, máx. 7 dígitos (los más recientes se descartan al exceder).
  - `digitosATiempo(digitos: string): number | null` — décimas; `null` si vacío o segundos ≥ 60.
  - `formatearDigitos(digitos: string): string` — muestra el tiempo en construcción (`"1023"` → `"1:02.3"`, `"5"` → `"0.5"`, `""` → `""`).
  - `interpretarTiempoPegado(texto: string): string | null` — si el texto contiene `:` o `.`, usa `parseTiempo` y devuelve los dígitos equivalentes; si no, `soloDigitos`.
  - `repartirSplits(distancia_m: number, n: number): number[]` — largo `n`, suma igual a `distancia_m`, el último absorbe el resto; `n < 1` o `distancia_m < 1` → `[]`.
  - `diferenciaSuma(tiempos_ds: number[], total_ds: number): number` — `suma − total` (0 si coincide).
  - `sesionInputSchema` (Zod) y `type SesionInput`: `{ id: uuid, atleta_id: uuid, tipo, modalidad, fecha: ISO datetime, distancia_m?: int>0, tiempo_ds?: int>0, spm_promedio?, fc_promedio?, fc_maxima?, calorias?, factor_arrastre?, rpe? (1–10), descripcion?, notas?, splits: { orden, distancia_m?, tiempo_ds }[] }`.

- [ ] **Step 1: Tests que fallan** (`digitos.test.ts`), con los valores de la tabla del spec §4: `formatearDigitos("5") === "0.5"`, `"1023" → "1:02.3"`, `"7035" → "7:03.5"`, `"10203" → "10:20.3"`, `"70355" → "1:10:35.5"`; `digitosATiempo("1023") === 623`, `("1753") === null`, `("") === null`; `soloDigitos("0012a3") === "123"`; `soloDigitos("12345678") === "1234567"` (Review Focus 3); `interpretarTiempoPegado("2:07.3") === "1273"`, `("2:07.3")` luego `digitosATiempo` da `1273`; `interpretarTiempoPegado("basura") === ""`.
- [ ] **Step 2: Tests que fallan** (`splits.test.ts`): `repartirSplits(2000, 8)` → ocho `250`; `repartirSplits(2000, 3)` → `[666, 666, 668]` y suma 2000; `repartirSplits(1500, 4)` suma 1500; `repartirSplits(2000, 0)` → `[]`; `diferenciaSuma([100,100], 200) === 0`, `([100,101], 200) === 1`.
- [ ] **Step 3: Tests que fallan** (`sesion-schema.test.ts`): acepta sesión mínima (`id`, `atleta_id`, `tipo`, `fecha`, `modalidad` por defecto `ergometro`); rechaza `tiempo_ds: 0`, `rpe: 11`, `orden` repetido en splits, `fecha` no ISO; Review Focus 4: rechaza splits donde algunos tienen `tiempo_ds` y otros no — como el input solo transporta splits con tiempo, el test es: `splits` con `tiempo_ds` ausente en un elemento → error.
- [ ] **Step 4:** `npm run test:unit` → FAIL.
- [ ] **Step 5:** Implementar los tres módulos con las firmas de Interfaces. `formatearDigitos` reutiliza `digitosATiempo` + `formatTiempo` salvo cuando los segundos son inválidos (entonces muestra los dígitos igual, separados con la misma regla, para que el campo se marque inválido con `digitosATiempo === null`).
- [ ] **Step 6:** `npm run test:unit && npm run typecheck && npm run lint` → PASS.
- [ ] **Step 7:** Commit `Dominio de la sesión: tiempo por dígitos, reparto de splits y esquema`.

---

### Task 2: RPC `guardar_sesion` (sesión + splits en una transacción)

**Files:**
- Create: `supabase/migrations/20261020000006_guardar_sesion.sql`, `lib/sesion/guardar.ts`
- Test: `tests/integration/guardar-sesion.test.ts` (se escribe; se ejecuta cuando exista proyecto de pruebas, ver "Decisión de entorno")

**Interfaces:**
- Consumes: `SesionInput` (Task 1), `crearClienteServidor`.
- Produces:
  - SQL `guardar_sesion(p_sesion jsonb, p_splits jsonb) returns uuid`, `security invoker` (RLS aplica), `volatile`, `set search_path = public, pg_catalog`, ejecutable por `authenticated`. Inserta en `sesion` con `id` del JSON, `creado_por = auth.uid()`, `origen = 'manual'`, `verificado = true`; luego los `split`. **Idempotente por `id`:** si ya existe una sesión con ese `id` creada por el mismo usuario, devuelve el `id` sin insertar nada (Review Focus 1).
  - `guardarSesion(supabase: SupabaseClient, input: SesionInput): Promise<{ ok: true; id: string } | { ok: false; error: string }>` en `lib/sesion/guardar.ts`. Mapea errores de RLS/consentimiento a "No se puede guardar: el atleta no tiene consentimiento vigente o está inactivo." (Review Focus 5) y el resto a un mensaje genérico en español; nunca expone mensajes SQL.

- [ ] **Step 1: Test de integración que falla** (`guardar-sesion.test.ts`), usando los helpers de `tests/integration/helpers.ts`: (a) entrenador asignado guarda sesión de 2000 m con 4 splits → 1 fila en `sesion` y 4 en `split`, `verificado = true`, `origen = 'manual'`, `creado_por` = entrenador; (b) llamar dos veces con el mismo `id` → sigue 1 sesión y 4 splits; (c) remero guardando con `atleta_id` de otro → error y cero filas; (d) atleta con consentimiento revocado → error y cero filas (no quedan splits huérfanos); (e) un split con `tiempo_ds = 0` → error y no queda la sesión (transacción).
- [ ] **Step 2:** Escribir la migración. Validaciones de forma en SQL mínimas (lo demás lo cubren `chk_*` y RLS): `p_splits` debe ser arreglo JSON (puede ser `[]`).
- [ ] **Step 3:** Implementar `guardarSesion` validando con `sesionInputSchema.safeParse` antes de llamar a `supabase.rpc('guardar_sesion', …)`.
- [ ] **Step 4:** `npm run typecheck && npm run lint` → PASS. (Los tests de integración quedan escritos.)
- [ ] **Step 5 (con el usuario):** el usuario corre `npx supabase db push` hacia prod y confirma. Sin esto, las tasks 3–4 no pueden guardar.
- [ ] **Step 6:** Commit `RPC guardar_sesion: sesión y splits en una transacción, idempotente por id`.

---

### Task 3: Formulario de sesión (el corazón)

**Files:**
- Create: `app/(app)/sesion/nueva/page.tsx`, `formulario.tsx`, `actions.ts`, `lib/atletas/lista.ts`
- Modify: `app/(app)/page.tsx` (activar "Cargar a mano" → `/sesion/nueva`; "Foto del ergómetro" sigue deshabilitado, Fase 2)
- Test: `tests/unit/formulario-sesion.test.ts` (lógica pura extraída: `armarSesionInput`)

**Interfaces:**
- Consumes: Task 1 (`soloDigitos`, `formatearDigitos`, `digitosATiempo`, `interpretarTiempoPegado`, `repartirSplits`, `diferenciaSuma`, `sesionInputSchema`), Task 2 (`guardarSesion`), `requerirUsuario`.
- Produces:
  - `atletasVisibles(supabase: SupabaseClient): Promise<{ id: string; nombre: string; apellido: string }[]>` — vía RLS, solo `activo = true`, ordenados por apellido.
  - `armarSesionInput(estado: EstadoFormulario): { ok: true; input: SesionInput } | { ok: false; errores: Record<string, string> }` — pura, en `lib/sesion/formulario.ts`; convierte los dígitos de cada campo de tiempo a décimas, reparte distancias de splits, y descarta splits **solo si todos** están vacíos (si algunos sí y otros no → error "Faltan tiempos en splits").
  - Server Action `guardarSesionAccion(prev, formData)` que revalida con `sesionInputSchema`, llama a `guardarSesion` y en éxito `redirect('/sesiones?guardada=1')`.

Comportamiento exigido (spec §7), cada punto con su aserción en `formulario-sesion.test.ts` cuando es lógica pura:
- Remero: el atleta es el propio y no se muestra selector. Entrenador/admin: selector con el último usado (cookie `ultimo_atleta`, httpOnly=false no necesario; se fija en la acción tras guardar) preseleccionado; con cero atletas muestra "Todavía no tienes atletas asignados." y un enlace a `/atletas/nuevo` (Review Focus 5).
- Distancia: chips (500/1000/2000/5000/6000) + campo libre numérico; tipo y modalidad con valores por defecto, accesibles en "Más datos" o como chips compactos de `tipo` arriba (decisión del implementador, mientras entrenamiento sea un toque).
- Tiempo total: `inputmode="numeric"`, se muestra con `formatearDigitos` mientras se escribe; inválido (segundos ≥ 60) se marca en rojo y bloquea Guardar.
- Splits: chips 4/5/8/otra; al elegir n aparecen n campos de tiempo; la distancia de cada uno se completa sola (`repartirSplits`) y se muestra de forma discreta; cada campo usa `enterKeyHint="next"` y salta al siguiente al presionar Enter; el último hace foco en Guardar. Si `diferenciaSuma` ≠ 0, aviso amarillo "Los splits suman X; el total es Y" (no bloquea).
- "Más datos" plegado: spm, FC promedio, FC máxima, calorías, drag, RPE, descripción, notas.
- Un solo botón "Guardar" fijo abajo (`position: sticky; bottom: 0`), ≥ 64 px, deshabilitado mientras se envía (Review Focus 1, además de la idempotencia por `id`: el `id` se genera con `crypto.randomUUID()` una vez al montar el formulario y se reutiliza al reintentar).
- Errores del servidor se muestran sobre el botón, en español.

- [ ] **Step 1: Tests que fallan** (`formulario-sesion.test.ts`): `armarSesionInput` con distancia 2000, total dígitos `"73555"` (= `7:35.5` → 4555 ds), 8 splits con tiempos válidos → `splits.length === 8`, distancias `250`, `orden` 1..8; con 8 splits todos vacíos → `splits: []` y ok; con 4 de 8 vacíos → error en `splits`; total vacío con splits llenos → ok (la sesión puede no tener total, `tiempo_ds` queda ausente) ; segundos inválidos → error en `tiempo`.
- [ ] **Step 2:** `npm run test:unit` → FAIL.
- [ ] **Step 3:** Implementar `lib/sesion/formulario.ts` (`EstadoFormulario`, `armarSesionInput`) y la lógica de la página, el componente cliente y la acción.
- [ ] **Step 4:** `npm run test:unit && npm run typecheck && npm run lint && npm run build` → PASS.
- [ ] **Step 5:** Commit `Formulario de sesión con splits, rápido en celular`.

---

### Task 4: Listado de sesiones

**Files:**
- Create: `app/(app)/sesiones/page.tsx`, `lib/sesion/listar.ts`
- Test: `tests/unit/listar-sesion.test.ts` (formateo de filas)

**Interfaces:**
- Consumes: `v_sesion_calculada` (RLS por `security_invoker`), `formatTiempo`, `registrar_acceso`.
- Produces: `listarSesiones(supabase, atletaId: string, limite = 50): Promise<FilaSesion[]>` con `FilaSesion = { id, fecha, tipo, distancia_m, tiempo, split500, watts, verificado, origen }` (`tiempo` y `split500` ya formateados con `formatTiempo`; `split500` desde `split_500_seg`, que la vista da en segundos con un decimal, formatear como `m:ss.d`).

- [ ] **Step 1: Test que falla:** `filaSesion({tiempo_ds: 4555, distancia_m: 2000, split_500_seg: 113.9, watts: 207, …})` → `tiempo === "7:35.5"`, `split500 === "1:53.9"`, `verificado` se conserva; con `tiempo_ds` o `distancia_m` null → `tiempo`/`split500` vacíos (`"—"`).
- [ ] **Step 2:** `npm run test:unit` → FAIL.
- [ ] **Step 3:** Implementar la lista: remero ve las suyas; entrenador/admin eligen atleta con `?atleta=<id>` (por defecto el último usado). Sesiones con `verificado = false` llevan insignia visible "Sin verificar" (AGENTS §5). Con `?guardada=1` muestra un aviso "Sesión guardada". Cuando quien mira no es el propio atleta, llama `registrar_acceso(atleta_id, 'ver_sesiones', null)` una vez por carga de página.
- [ ] **Step 4:** `npm run test:unit && npm run typecheck && npm run lint && npm run build` → PASS.
- [ ] **Step 5:** Commit `Listado de sesiones con indicador de no verificadas y registro de accesos`.

---

### Task 5: CRUD de atletas (lista, alta, ficha, editar)

**Files:**
- Create: `app/(app)/atletas/page.tsx`, `app/(app)/atletas/nuevo/{page.tsx,formulario.tsx,actions.ts}`, `app/(app)/atletas/[id]/{page.tsx,actions.ts}`
- Test: `tests/unit/atleta-form.test.ts`; `tests/integration/atletas-admin.test.ts` (acciones de la ficha)

**Interfaces:**
- Consumes: `altaAtletaSchema`, `relacionPermitida` (`lib/schemas/consentimiento.ts`), RPC `crear_atleta_con_consentimiento`, `asegurarUsuarioAtleta` + `generarEnlace` (`lib/acceso/*`), `crearClienteAdmin`, `NEXT_PUBLIC_SITE_URL`, `requerirUsuario`.
- Produces (Server Actions en `atletas/[id]/actions.ts`, todas llaman a `requerirUsuario()` y verifican `rol in ('entrenador','admin')`):
  - `crearAtletaAccion(prev, formData)` — valida con `altaAtletaSchema`, llama a la RPC con el cliente del usuario (RLS), redirige a `/atletas/<id>`.
  - `editarAtletaAccion(prev, formData)` — actualiza campos de `atletaSchema` con el cliente del usuario (política `atleta_update`).
  - `cambiarActivoAccion(atletaId, activo)`.
  - `revocarConsentimientoAccion(atletaId)` — pone `revocado_en = now()` en el consentimiento vigente, con el cliente del usuario (el trigger solo permite eso). Tras revocar, la ficha muestra "Acceso bloqueado" y ofrece eliminar datos (solo admin).
  - `generarEnlaceAccion(atletaId): Promise<{ url: string } | { error: string }>` — **verifica** que el usuario puede ver al atleta (consulta con su propio cliente: si RLS devuelve 0 filas, rechaza) y luego `asegurarUsuarioAtleta` + `generarEnlace(admin, { usuarioId, creadoPor: usuario.id, siteUrl })`.

Ficha: datos, estado del consentimiento (quién, cuándo, versión), botón "Generar enlace de acceso" que muestra la URL y un botón "Compartir" (`navigator.share` con respaldo a copiar), botón "Ver sesiones" (→ `/sesiones?atleta=`), editar, activar/desactivar, revocar. Al abrir la ficha un tercero, `registrar_acceso(id, 'ver_ficha')`.

- [ ] **Step 1: Tests unitarios que fallan** (`atleta-form.test.ts`): el formulario de alta transforma `FormData` en el objeto de `altaAtletaSchema`: `peso_kg`/`altura_cm` vacíos → ausentes (no `0`), números como número; fecha de nacimiento 2011 con relación `propio` → error en `consentimiento.relacion`; `otorgado_en` vacío → error. Función pura `formDataAAlta(fd: FormData)` exportada desde `lib/atletas/formulario.ts`.
- [ ] **Step 2: Tests de integración que fallan** (`atletas-admin.test.ts`): entrenador A llama la acción lógica de generar enlace para un atleta de entrenador B → rechazada y sin fila nueva en `enlace_acceso`; entrenador asignado → URL con `/entrar?t=`; tras revocar el consentimiento, `generarEnlace` rechaza y `perfilConAcceso` devuelve `null`; revocar dos veces no cambia `revocado_en`.
- [ ] **Step 3:** `npm run test:unit` → FAIL.
- [ ] **Step 4:** Implementar. Navegación: `/atletas` lista con búsqueda por nombre en el cliente (30 atletas, sin paginación); enlace destacado "Nuevo atleta". El formulario de alta pide consentimiento obligatorio en la misma pantalla (versión por defecto `v1`, medio por defecto `papel`, fecha de hoy) para minimizar toques.
- [ ] **Step 5:** `npm run test:unit && npm run typecheck && npm run lint && npm run build` → PASS.
- [ ] **Step 6:** Commit `CRUD de atletas: alta con consentimiento, ficha, edición, enlace y revocación`.

---

### Task 6: Exportar y eliminar los datos de un atleta

**Files:**
- Create: `lib/atletas/exportar.ts`, `lib/atletas/eliminar.ts`, `app/(app)/atletas/[id]/exportar/route.ts`
- Modify: `app/(app)/atletas/[id]/actions.ts` (agrega `eliminarAtletaAccion`), `app/(app)/atletas/[id]/page.tsx`
- Test: `tests/unit/exportar.test.ts`; `tests/integration/atletas-admin.test.ts` (casos nuevos)

**Interfaces:**
- Consumes: `crearClienteAdmin`, `registrar_acceso` (vía insert con service role, igual que `generarEnlace`).
- Produces:
  - `exportarAtleta(admin: SupabaseClient, atletaId: string): Promise<ExportacionAtleta>` — `{ atleta, sesiones (con splits anidados), capturas, consentimientos, registro_acceso, exportado_en }`. Las capturas no incluyen contenido de la foto.
  - `eliminarAtleta(admin: SupabaseClient, atletaId: string, ejecutadoPor: string): Promise<void>` — en este orden: lista y borra los objetos de Storage de las capturas del atleta (`storage_path`), borra el `atleta` (cascade), borra el usuario de Auth (`auth.admin.deleteUser`) si existe, inserta en `registro_acceso` `{ accion: 'eliminar', atleta_id: null, usuario_id: ejecutadoPor, detalle: { atleta_id_eliminado } }`. Falla en voz alta si algún paso falla (no deja eliminación a medias en silencio) y es reintentable (cada paso tolera "ya no existe").
  - Route Handler GET `/atletas/[id]/exportar` — verifica rol entrenador del atleta o admin, registra `exportar`, responde JSON con `Content-Disposition: attachment; filename="atleta-<id>.json"`.
  - `eliminarAtletaAccion(atletaId, confirmacion: string)` — **solo admin**; exige que `confirmacion` sea el apellido exacto del atleta (confirmación tipeada).

- [ ] **Step 1: Test unitario que falla** (`exportar.test.ts`): una función pura `armarExportacion(filas)` no incluye claves `storage_path` de fotos ya eliminadas con contenido y agrupa splits bajo su sesión ordenados por `orden`.
- [ ] **Step 2: Tests de integración que fallan:** exportar devuelve atleta, sus 2 sesiones con splits y el consentimiento, y nada de otro atleta; un entrenador no asignado recibe 403 en la ruta; eliminar como admin deja 0 filas del atleta en `atleta`, `sesion`, `split`, `consentimiento`, borra el usuario de Auth y deja la fila `eliminar` con `atleta_id` nulo; eliminar como entrenador es rechazado; con una captura subida, el objeto de Storage desaparece.
- [ ] **Step 3:** `npm run test:unit` → FAIL.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** `npm run test:unit && npm run typecheck && npm run lint && npm run build` → PASS.
- [ ] **Step 6:** Commit `Exportar y eliminar todos los datos de un atleta`.

---

### Task 7: Entrenadores y asignaciones (admin)

Sin esto, en prod el único usuario que puede existir además del admin son atletas creados por el admin (sin entrenador asignado). El diseño (§2) ya lo prevé. **Mi decisión**: incluirlo en la fase 1 con alcance mínimo.

**Files:**
- Create: `app/(app)/entrenadores/page.tsx`, `app/(app)/entrenadores/actions.ts`
- Test: `tests/integration/atletas-admin.test.ts` (casos nuevos)

**Interfaces:**
- Consumes: `crearUsuarioStaff`, `generarEnlace`, `crearClienteAdmin`, `requerirUsuario`.
- Produces: Server Actions solo admin: `crearEntrenadorAccion(prev, formData)` (nombre; crea el usuario con `crearUsuarioStaff({ rol: 'entrenador' })` y devuelve su enlace con `generarEnlace`); `regenerarEnlaceStaffAccion(usuarioId)`; `asignarAtletaAccion(entrenadorId, atletaId)` (inserta en `asignacion_entrenador` con `desde = hoy`); `terminarAsignacionAccion(entrenadorId, atletaId)` (pone `hasta = hoy_santiago`). Página con lista de entrenadores y, por cada uno, sus atletas asignados y un selector para agregar.

- [ ] **Step 1: Tests de integración que fallan:** admin crea entrenador → hay perfil `entrenador` y enlace vigente; un entrenador que llama `crearEntrenadorAccion` es rechazado; tras `asignarAtletaAccion` el entrenador ve al atleta (cliente autenticado como él) y tras `terminarAsignacionAccion` con `hasta` en el pasado deja de verlo.
- [ ] **Step 2:** Implementar páginas y acciones; la página redirige con `/sin-acceso` si el rol no es admin.
- [ ] **Step 3:** `npm run test:unit && npm run typecheck && npm run lint && npm run build` → PASS.
- [ ] **Step 4:** Commit `Alta de entrenadores y asignación de atletas (admin)`.

---

### Task 8: Navegación e inicio

**Files:**
- Modify: `app/(app)/page.tsx`, `app/(app)/layout.tsx`
- Test: `tests/unit/menu.test.ts`

**Interfaces:**
- Consumes: `UsuarioActual` (`lib/acceso/actual.ts`).
- Produces: `opcionesInicio(rol: UsuarioActual['rol']): { texto: string; href: string; activo: boolean }[]` en `lib/inicio.ts`.

Contenido por rol: remero → "Cargar a mano" (`/sesion/nueva`), "Mis sesiones" (`/sesiones`), "Foto del ergómetro" (deshabilitado, "Pronto"). Entrenador → además "Atletas" (`/atletas`). Admin → además "Entrenadores" (`/entrenadores`). "Cerrar sesión" sigue igual.

- [ ] **Step 1: Test que falla:** `opcionesInicio('remero')` no contiene `/atletas` ni `/entrenadores`; `'entrenador'` contiene `/atletas` y no `/entrenadores`; `'admin'` contiene ambos; "Foto del ergómetro" siempre `activo: false`.
- [ ] **Step 2:** `npm run test:unit` → FAIL.
- [ ] **Step 3:** Implementar y usar en la página de inicio.
- [ ] **Step 4:** `npm run test:unit && npm run typecheck && npm run lint && npm run build` → PASS.
- [ ] **Step 5:** Commit `Inicio con opciones por rol`.

---

### Task 9: Despliegue y criterio de salida de la fase 1 (con el usuario)

- [ ] **Step 1:** Push y deploy a Vercel (el usuario ya conecta el repo en la Task 11 de la fase 0; si no, hacerlo ahora). Confirmar que `npx supabase db push` de la 000006 se aplicó a prod.
- [ ] **Step 2:** Con el admin real: crear un entrenador, asignarle dos atletas de prueba (nombres claramente marcados "PRUEBA …", con consentimiento de prueba) y mandar el enlace por WhatsApp al celular del entrenador.
- [ ] **Step 3: Criterio de salida (AGENTS §7):** desde el celular, cronometrar a una persona que **no ha visto instrucciones** cargando una sesión de 2000 m con 8 splits. Meta: < 30 s. Medir 3 veces y anotar tiempos en el PR. Si no se cumple, iterar el formulario (Task 3) antes de cerrar la fase.
- [ ] **Step 4:** Probar exportar y eliminar sobre un atleta de PRUEBA. Verificar que quedan 0 filas del atleta y la fila `eliminar` en `registro_acceso`.
- [ ] **Step 5:** Borrar los datos de prueba (con la acción de eliminar) y commit `Fase 1: verificación de salida` solo si hubo ajustes.
