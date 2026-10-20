# Fase 0 — Fundaciones: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo de Next.js + Supabase con esquema completo, RLS probada, acceso por enlace para todos los roles, PWA instalable, CI y deploy a Vercel, levantable desde cero en menos de 15 minutos.

**Architecture:** Next.js App Router con Server Components y Server Actions; Supabase local (Docker) para desarrollo y tests. Toda la autorización vive en Postgres (RLS + funciones `security definer`); la app solo usa service role en código de servidor para altas de usuarios y enlaces. La lógica de enlaces vive en `lib/acceso/` como funciones que reciben el cliente admin por parámetro, para poder usarlas desde Next, scripts y tests.

**Tech Stack:** Next.js (última estable), React, TypeScript estricto, Tailwind, `@supabase/supabase-js`, `@supabase/ssr`, Zod, Vitest, Supabase CLI, `tsx` (solo para scripts), GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-20-regatapp-design.md` (diseño, gana) y `AGENTS.md` (especificación base). Leer ambos.

## Global Constraints

- TypeScript `strict: true`; nada de `any` implícito.
- Esquema solo por migraciones en `supabase/migrations/`; `supabase db reset` reproduce todo.
- Tiempos en décimas de segundo como `integer`. Split y watts nunca se guardan; se derivan.
- Una sola tabla `sesion` para entrenamiento, test y competencia.
- RLS activa en todas las tablas desde la primera migración.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` jamás llegan al cliente (nada con service role en archivos importados por componentes cliente).
- Validación de entrada con Zod en `lib/schemas/`, compartida cliente/servidor.
- Interfaz en español de Chile; fechas en `America/Santiago`; `lang="es-CL"`.
- Commits en español, uno por unidad coherente, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No agregar dependencias fuera de las listadas en Tech Stack sin justificarlo en el commit.
- Sin service worker en fase 0. Sin Playwright en fase 0.
- Ningún dato real de atletas en el repo, en `seed.sql` ni en tests.

## Review Focus

1. **Previsualización de WhatsApp:** un GET a `/entrar?t=…` (lo hace WhatsApp al previsualizar) no debe consumir el enlace; el remero debe poder entrar después. → test en Task 7.
2. **Enlace vencido, usado o inexistente:** el remero ve un mensaje claro en español ("Este enlace ya se usó. Pídele uno nuevo a tu entrenador"), no un error 500. → test en Task 7 (`resolverEnlace`).
3. **Atleta desactivado o con consentimiento revocado:** no puede entrar con un enlace nuevo ni seguir usando una sesión ya abierta, ni se le pueden cargar sesiones. → tests en Task 4 (insert de sesión) y Task 7 (`resolverEnlace`).
4. **Bordes de la asignación de entrenador:** `hasta = hoy` sigue vigente; `desde` en el futuro aún no lo es. → test en Task 4.
5. **Entrada de tiempo con basura:** `""`, `"  1:02.3 "`, `"1:75.3"`, `"1753"`, `"abc"`, `"0"` → `null` o valor correcto, nunca `NaN`. → test en Task 2.

---

## Estructura de archivos

```
app/
  layout.tsx                    raíz, lang es-CL
  manifest.ts                   PWA
  icons/[tam]/route.tsx         íconos PNG generados con ImageResponse
  (auth)/entrar/page.tsx        "Entrar como <nombre>"
  (auth)/entrar/actions.ts      Server Action entrar()
  (auth)/sin-acceso/page.tsx    mensaje para quien no tiene sesión/acceso
  (app)/layout.tsx              exige usuario con acceso vigente
  (app)/page.tsx                inicio con dos botones grandes
  (app)/actions.ts              cerrarSesion()
lib/
  env.ts                        variables validadas con Zod (servidor / público)
  tiempo.ts                     parse/format/split/watts
  schemas/consentimiento.ts     Zod + regla menor de edad
  supabase/server.ts            cliente con cookies (RSC, actions)
  supabase/browser.ts           cliente navegador
  supabase/admin.ts             service role, import 'server-only'
  acceso/enlace.ts              generar/resolver/canjear enlaces (cliente por parámetro)
  acceso/usuario.ts             asegurar usuario Auth + perfil para atleta/entrenador
  acceso/actual.ts              usuario actual + estado de acceso
proxy.ts | middleware.ts        refresco de sesión @supabase/ssr (el nombre que use la versión instalada de Next)
supabase/
  config.toml
  migrations/20261020000001_esquema_inicial.sql
  migrations/20261020000002_rls.sql
  migrations/20261020000004_crear_atleta.sql
  seed.sql
scripts/
  env-local.mjs                 escribe .env.local desde `supabase status -o env`
  crear-admin.ts
  enlace-atleta.ts
tests/
  unit/tiempo.test.ts
  unit/consentimiento.test.ts
  integration/helpers.ts
  integration/vista.test.ts
  integration/rls.test.ts
  integration/crear-atleta.test.ts
  integration/enlace.test.ts
vitest.config.ts
.env.example
.github/workflows/ci.yml
README.md
```

---

### Task 1: Esqueleto de Next.js

**Files:**
- Create: todo lo que genera `create-next-app`, `vitest.config.ts`, `.env.example`, `app/layout.tsx` (modificar)

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test:unit` (`vitest run --project unit`), `test:integration` (`vitest run --project integration`). Alias `@/*` → raíz.

- [ ] **Step 1:** En la raíz del repo (que ya tiene `AGENTS.md` y `docs/`), correr `npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm`. Si se niega por directorio no vacío, generar en un directorio temporal y mover los archivos.
- [ ] **Step 2:** Confirmar `"strict": true` en `tsconfig.json`; agregar script `typecheck`.
- [ ] **Step 3:** Instalar `@supabase/supabase-js @supabase/ssr zod server-only` y como dev `vitest tsx`.
- [ ] **Step 4:** `vitest.config.ts` con dos proyectos: `unit` (`tests/unit/**/*.test.ts`, entorno node) e `integration` (`tests/integration/**/*.test.ts`, `fileParallelism: false`, `testTimeout: 20000`). Resolver alias `@` a la raíz.
- [ ] **Step 5:** `app/layout.tsx`: `<html lang="es-CL">`, título "Regatapp". Borrar el contenido de demostración de `app/page.tsx` (se reemplaza en Task 8).
- [ ] **Step 6:** `.env.example` con todas las variables de `AGENTS.md` §10 más `OCR_MODEL=claude-sonnet-5-5` y `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, cada una con comentario `# solo servidor` donde corresponda. `.gitignore` incluye `.env*.local`.
- [ ] **Step 7:** Verificar: `npm run lint && npm run typecheck && npm run build` terminan sin errores.
- [ ] **Step 8:** Commit `Esqueleto de Next.js con TypeScript estricto, Tailwind y Vitest`.

---

### Task 2: Tiempos, split y watts (`lib/tiempo.ts`)

**Files:**
- Create: `lib/tiempo.ts`, `tests/unit/tiempo.test.ts`

**Interfaces:**
- Produces:
  - `parseTiempo(texto: string): number | null` — décimas.
  - `formatTiempo(ds: number): string`
  - `split500(tiempo_ds: number, distancia_m: number): number` — décimas por 500 m, redondeado al entero.
  - `watts(tiempo_ds: number, distancia_m: number): number` — entero.

Reglas (spec §4):
- Solo dígitos: el último son décimas, los dos anteriores segundos, el resto minutos. Segundos ≥ 60 → `null`.
- Con separadores: `m:ss.d`, `m:ss`, `h:mm:ss.d`, `h:mm:ss`. Segundos o minutos (en `h:mm`) ≥ 60 → `null`. Recortar espacios.
- `""`, texto no numérico, o resultado 0 → `null`.
- `formatTiempo`: `< 600` ds → `s.d` (`"0.5"`, `"12.3"`); `< 36000` → `m:ss.d`; si no → `h:mm:ss.d`.
- `split500 = Math.round(tiempo_ds * 500 / distancia_m)`; `watts = Math.round(2.80 / pace³)` con `pace = (tiempo_ds/10) / distancia_m`.

- [ ] **Step 1: Tests que fallan**

```ts
describe('parseTiempo', () => {
  it.each([
    ['5', 5], ['123', 123], ['1023', 623], ['7035', 4235],
    ['10203', 6203], ['70355', 42355],
    ['1:02.3', 623], ['7:03', 4230], ['1:10:35.5', 42355], ['  1:02.3 ', 623],
  ])('%s → %i', (t, ds) => expect(parseTiempo(t)).toBe(ds))
  it.each(['', '   ', 'abc', '0', '1753', '1:75.3', '1:60:00.0', '1:02.3.4'])(
    '%j → null', (t) => expect(parseTiempo(t)).toBeNull())
})
describe('formatTiempo', () => {
  it.each([[5, '0.5'], [123, '12.3'], [623, '1:02.3'], [4235, '7:03.5'],
           [6203, '10:20.3'], [42355, '1:10:35.5']])(
    '%i → %s', (ds, t) => expect(formatTiempo(ds)).toBe(t))
  it('ida y vuelta', () => { for (const ds of [1, 599, 600, 35999, 36000, 42355])
    expect(parseTiempo(formatTiempo(ds))).toBe(ds) })
})
describe('split500 y watts', () => {
  it('2000 m en 7:00.0', () => { expect(split500(4200, 2000)).toBe(1050); expect(watts(4200, 2000)).toBe(302) })
  it('500 m en 1:30.0',  () => { expect(split500(900, 500)).toBe(900);   expect(watts(900, 500)).toBe(480) })
})
```

- [ ] **Step 2:** `npm run test:unit` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `lib/tiempo.ts` con las reglas de arriba.
- [ ] **Step 4:** `npm run test:unit` → PASS.
- [ ] **Step 5:** Commit `Conversión de tiempos, split /500 m y watts`.

---

### Task 3: Supabase local y esquema inicial

**Files:**
- Create: `supabase/config.toml` (vía `supabase init`), `supabase/migrations/20261020000001_esquema_inicial.sql`, `supabase/seed.sql`, `scripts/env-local.mjs`, `tests/integration/helpers.ts`, `tests/integration/vista.test.ts`

**Interfaces:**
- Consumes: `split500`, `watts` de Task 2.
- Produces (`tests/integration/helpers.ts`):
  - `admin(): SupabaseClient` — service role.
  - `crearUsuario(opts: { rol: 'remero' | 'entrenador' | 'admin'; atletaId?: string; nombre?: string }): Promise<{ id: string; cliente: SupabaseClient }>` — crea usuario con `auth.admin.createUser({ email: \`t-${uuid}@test.invalid\`, password, email_confirm: true })`, inserta `perfil` con service role, inicia sesión con contraseña y devuelve un cliente autenticado (las contraseñas existen solo en tests).
  - `crearAtleta(opts?: { activo?: boolean; consentimiento?: boolean; fechaNacimiento?: string }): Promise<string>` — inserta atleta (y consentimiento vigente por defecto) con service role; devuelve id.
  - `asignar(entrenadorId: string, atletaId: string, desde?: string, hasta?: string | null): Promise<void>`
  - `crearSesion(atletaId: string, campos?: Partial<{ tipo; distancia_m; tiempo_ds }>): Promise<string>` — service role.
- Produces (`scripts/env-local.mjs`): `npm run env:local` escribe `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` (`API_URL`), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY` (`SERVICE_ROLE_KEY`) leídos de `supabase status -o env`, y conserva las demás líneas de `.env.example`. Los tests de integración cargan `.env.local` (o el entorno, en CI).

- [ ] **Step 1:** `npx supabase init`. En `config.toml`: `[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls` con la URL local; `[auth.email] otp_expiry = 86400`; `enable_signup = false` para registro público (las altas las hace el servidor); verificar que no haya `[auth.sessions] timebox` ni `inactivity_timeout` activos.
- [ ] **Step 2:** Migración `…_esquema_inicial.sql`: el SQL de `AGENTS.md` §4 **tal cual**, con estos cambios del diseño:
  - Vista `create view v_sesion_calculada with (security_invoker = true) as …` (spec §5.1).
  - Tablas `consentimiento`, `registro_acceso` (§5.2) y `enlace_acceso` (§5.3), copiadas literalmente.
  - `perfil.nombre text not null default ''`, `captura.foto_eliminada_en timestamptz`.
  - `alter table … enable row level security` en **todas** las tablas (sin políticas todavía: con RLS activa y sin políticas, nadie lee; las políticas llegan en Task 4).
- [ ] **Step 3:** `seed.sql` vacío salvo un comentario (los tests crean sus propios datos; los atletas de ejemplo para desarrollo se agregan en Task 9).
- [ ] **Step 4: Test que falla** — `tests/integration/vista.test.ts`: con service role crea un atleta y sesiones `[(4200,2000), (900,500), (6203,1500), (42355,10000)]`, lee `v_sesion_calculada` y comprueba para cada una `split_500_seg * 10 === split500(t,d)` y `watts === watts(t,d)`. Para una sesión con `distancia_m = null`, ambas columnas son `null`.
- [ ] **Step 5:** `npx supabase start`, `npx supabase db reset`, `npm run env:local`, `npm run test:integration` → PASS. (Si falla, la discrepancia entre SQL y TS se corrige en `lib/tiempo.ts` salvo que la vista contradiga a `AGENTS.md`.)
- [ ] **Step 6:** Commit `Supabase local y esquema inicial con vista security_invoker`.

---

### Task 4: Políticas RLS y Storage

**Files:**
- Create: `supabase/migrations/20261020000002_rls.sql`, `tests/integration/rls.test.ts`

**Interfaces:**
- Produces (SQL, todas `security definer`, `stable`, `set search_path = public`, `grant execute … to authenticated`):
  - `es_admin() returns boolean`, `es_entrenador() returns boolean`
  - `mi_atleta_id() returns uuid`
  - `entrena_a(atleta uuid) returns boolean` — `desde <= current_date and (hasta is null or hasta >= current_date)`
  - `puede_ver_atleta(atleta uuid) returns boolean` — `es_admin() or atleta = mi_atleta_id() or entrena_a(atleta)`
  - `consentimiento_vigente(atleta uuid) returns boolean` — existe fila con `revocado_en is null`
  - `registrar_acceso(p_atleta_id uuid, p_accion text, p_detalle jsonb default null) returns void` — volatile, inserta con `auth.uid()`.

Políticas: la tabla de spec §6, con estas precisiones:
- `atleta`: select `puede_ver_atleta(id)`; update `es_admin() or entrena_a(id)`; delete `es_admin()`; **sin política de insert** (se crea solo vía `crear_atleta_con_consentimiento`, Task 5, que exige rol entrenador o admin — implementa "crear: entrenador o admin" del spec y garantiza que no exista atleta sin consentimiento).
- `sesion`: select/update/delete `puede_ver_atleta(atleta_id)`; insert con check `puede_ver_atleta(atleta_id) and creado_por = auth.uid() and consentimiento_vigente(atleta_id) and (select activo from atleta where id = atleta_id)`. Update con el mismo check salvo `creado_por`.
- `split`: todo vía `exists (select 1 from sesion s where s.id = sesion_id and puede_ver_atleta(s.atleta_id))`.
- `captura`: select `subida_por = auth.uid() or es_admin() or exists (sesion visible con captura_id = captura.id)`; insert check `subida_por = auth.uid()`; update igual que select.
- `perfil`: select `user_id = auth.uid() or es_admin() or entrena_a(atleta_id)`; escritura solo `es_admin()`.
- `competencia`: select `true` para `authenticated`; escritura `es_admin() or es_entrenador()`.
- `consentimiento`: select `(es_admin() or entrena_a(atleta_id))`; insert/update `es_admin() or entrena_a(atleta_id)`.
- `registro_acceso`: select `es_admin()`; `revoke insert, update, delete on registro_acceso from anon, authenticated`.
- `enlace_acceso`: sin políticas; `revoke all … from anon, authenticated`.
- Storage: `insert into storage.buckets (id, name, public) values ('capturas','capturas', false)`; políticas en `storage.objects` para `bucket_id = 'capturas' and (storage.foldername(name))[1] = auth.uid()::text` en insert y select.

- [ ] **Step 1: Tests que fallan** — `tests/integration/rls.test.ts`, un `describe` por caso del spec §6 más los de Review Focus:
  1. `remero A consulta sesion y v_sesion_calculada de atleta B → []` (y sí ve la propia).
  2. `remero A inserta sesion con atleta_id de B → error`; con su propio atleta → ok.
  3. `entrenador ve atleta asignado y no el no asignado`; `asignación con hasta = ayer → no lo ve`; `hasta = hoy → lo ve`; `desde = mañana → no lo ve`.
  4. `admin ve todas las sesiones creadas en el test`.
  5. `remero lee registro_acceso y enlace_acceso → [] o error`; `remero llama registrar_acceso → ok, pero sigue sin poder leerlo`; `admin lee la fila registrada con usuario_id del remero`.
  6. `inserta sesion para atleta con consentimiento revocado → error`; `para atleta activo = false → error`.
  7. `remero lee split de una sesión ajena → []`.
  8. `remero no puede leer consentimiento propio`; `entrenador asignado sí`.
  9. `remero sube a capturas/<otro_uid>/x.jpg → error`; `a capturas/<su_uid>/x.jpg → ok`.
  10. `remero intenta insert directo en atleta → error`.
- [ ] **Step 2:** `npx supabase db reset && npm run test:integration` → FAIL.
- [ ] **Step 3:** Escribir la migración.
- [ ] **Step 4:** `npx supabase db reset && npm run test:integration` → PASS (incluye `vista.test.ts`).
- [ ] **Step 5:** Commit `Políticas RLS, funciones de acceso y bucket de capturas`.

---

### Task 5: Alta de atleta con consentimiento

**Files:**
- Create: `supabase/migrations/20261020000004_crear_atleta.sql`, `lib/schemas/consentimiento.ts`, `lib/schemas/atleta.ts`, `tests/unit/consentimiento.test.ts`, `tests/integration/crear-atleta.test.ts`

**Interfaces:**
- Produces (SQL): `crear_atleta_con_consentimiento(p_atleta jsonb, p_consentimiento jsonb) returns uuid`, `security definer`, en una transacción: exige `es_admin() or es_entrenador()` (si no, `raise exception 'sin permiso'`); valida la regla de relación (abajo); inserta `atleta`, `consentimiento` (con `registrado_por = auth.uid()`) y, si quien llama es entrenador, `asignacion_entrenador(auth.uid(), id)`. `grant execute to authenticated`.
- Produces (TS):
  - `consentimientoSchema` (Zod): `otorgado_por_nombre` no vacío, `otorgado_por_rut` opcional, `relacion` enum `apoderado|tutor_legal|propio`, `medio` enum `papel|digital`, `version_texto` no vacío, `otorgado_en` fecha `YYYY-MM-DD` no futura.
  - `atletaSchema` (Zod): `nombre`, `apellido` no vacíos (recortados); `fecha_nacimiento` opcional; `sexo` `M|F|X` opcional; `peso_kg`, `altura_cm`, `categoria_peso` opcionales.
  - `relacionPermitida(fechaNacimiento: string | null, relacion: 'apoderado' | 'tutor_legal' | 'propio', hoy: Date): boolean` — `propio` solo si hay fecha y la edad en `America/Santiago` es ≥ 18.
  - `altaAtletaSchema = z.object({ atleta: atletaSchema, consentimiento: consentimientoSchema }).superRefine(…)` usando `relacionPermitida`.

- [ ] **Step 1: Tests unitarios que fallan:** `relacionPermitida(null,'propio',hoy) === false`; `('2010-05-01','propio', 2026-10-20) === false`; `('2008-10-20','propio', 2026-10-20) === true` (cumple 18 ese día); `('2008-10-21','propio', 2026-10-20) === false`; `apoderado` siempre `true`; `altaAtletaSchema` rechaza nombre `"  "`.
- [ ] **Step 2: Tests de integración que fallan:** entrenador llama la RPC → recibe id y luego ve al atleta y su consentimiento; remero llama la RPC → error; menor con `relacion = 'propio'` → error y no queda atleta creado; admin llama la RPC → no se crea asignación.
- [ ] **Step 3:** `npm run test:unit; npx supabase db reset; npm run test:integration` → FAIL.
- [ ] **Step 4:** Implementar migración y esquemas. La regla de edad en SQL usa `age(current_date at time zone 'America/Santiago', fecha_nacimiento) >= interval '18 years'`.
- [ ] **Step 5:** Mismos comandos → PASS.
- [ ] **Step 6:** Commit `Alta de atleta con consentimiento obligatorio`.

---

### Task 6: Clientes Supabase, variables de entorno y refresco de sesión

**Files:**
- Create: `lib/env.ts`, `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/admin.ts`, `proxy.ts` (o `middleware.ts` según la versión de Next instalada)

**Interfaces:**
- Produces:
  - `envPublico: { NEXT_PUBLIC_SUPABASE_URL: string; NEXT_PUBLIC_SUPABASE_ANON_KEY: string; NEXT_PUBLIC_SITE_URL: string }` (Zod, `lib/env.ts`).
  - `envServidor(): { SUPABASE_SERVICE_ROLE_KEY: string }` en `lib/supabase/admin.ts` (no en `lib/env.ts`, para que nunca se importe desde el cliente).
  - `crearClienteServidor(): Promise<SupabaseClient>` — `createServerClient` de `@supabase/ssr` con `cookies()` de `next/headers`.
  - `crearClienteNavegador(): SupabaseClient`
  - `crearClienteAdmin(): SupabaseClient` — `import 'server-only'`, `auth: { persistSession: false, autoRefreshToken: false }`.
  - Proxy/middleware: refresca la sesión según la guía oficial de `@supabase/ssr` para la versión instalada; matcher excluye `_next/static`, `_next/image`, `icons`, `manifest.webmanifest`, `favicon.ico`.

- [ ] **Step 1:** Implementar los cuatro archivos siguiendo la documentación vigente de `@supabase/ssr` (verificar el nombre `proxy.ts` vs `middleware.ts` en la versión de Next instalada).
- [ ] **Step 2:** Verificar: `npm run typecheck && npm run build` pasan; buscar en `.next/static` que no aparezca la cadena `SUPABASE_SERVICE_ROLE_KEY` ni el valor de la clave (`grep -r` sobre `.next/static`) → sin resultados.
- [ ] **Step 3:** Commit `Clientes de Supabase y refresco de sesión`.

---

### Task 7: Enlaces de acceso (lógica)

**Files:**
- Create: `lib/acceso/usuario.ts`, `lib/acceso/enlace.ts`, `tests/integration/enlace.test.ts`

**Interfaces:**
- Consumes: tablas de Task 3, `consentimiento_vigente` de Task 4.
- Produces (todas reciben `admin: SupabaseClient` con service role; sin `import 'server-only'` para que las usen los scripts):
  - `correoSintetico(prefijo: 'a' | 'u', id: string): string` → `` `${prefijo}-${id}@remeros.invalid` ``. Si GoTrue rechaza `.invalid`, cambiar el dominio aquí (único lugar) y anotarlo en el commit.
  - `asegurarUsuarioAtleta(admin, atletaId: string): Promise<string>` — si `atleta.user_id` es null: `auth.admin.createUser({ email: correoSintetico('a', atletaId), email_confirm: true })`, inserta `perfil(rol 'remero', atleta_id, nombre = nombre + ' ' + apellido)`, actualiza `atleta.user_id`. Devuelve el user id. Idempotente.
  - `crearUsuarioStaff(admin, opts: { nombre: string; rol: 'entrenador' | 'admin'; correo?: string }): Promise<string>` — correo real o `correoSintetico('u', uuid)`; crea `perfil`.
  - `generarEnlace(admin, opts: { usuarioId: string; creadoPor: string | null; siteUrl: string }): Promise<string>` — `auth.admin.generateLink({ type: 'magiclink', email })`, toma `data.properties.hashed_token`, inserta `enlace_acceso(usuario_id, token_hash, creado_por, vence_en = now + 24 h)`, registra `registro_acceso(accion 'generar_enlace', atleta_id del perfil si lo hay, usuario_id = creadoPor)` con insert directo del service role, devuelve `` `${siteUrl}/entrar?t=${hashed_token}` ``.
  - `type ResultadoEnlace = { ok: true; nombre: string; usuarioId: string } | { ok: false; motivo: 'inexistente' | 'vencido' | 'usado' | 'sin_acceso' }`
  - `resolverEnlace(admin, token: string): Promise<ResultadoEnlace>` — solo lee; `sin_acceso` si el perfil es remero y el atleta está inactivo o sin consentimiento vigente.
  - `MENSAJES_ENLACE: Record<Exclude<…motivo>, string>` — copy: inexistente "Este enlace no es válido.", vencido "Este enlace venció. Pídele uno nuevo a tu entrenador.", usado "Este enlace ya se usó. Pídele uno nuevo a tu entrenador.", sin_acceso "Tu acceso está desactivado. Habla con tu entrenador."
  - `marcarUsado(admin, token: string): Promise<void>`
  - `accesoVigente(admin, usuarioId: string): Promise<boolean>` — staff: tiene perfil; remero: atleta activo y consentimiento vigente.

- [ ] **Step 1: Tests que fallan** (`enlace.test.ts`, contra Supabase local):
  - `asegurarUsuarioAtleta` dos veces devuelve el mismo id y deja un solo `perfil`.
  - `resolverEnlace` sobre un enlace recién generado → `{ ok: true, nombre: 'Ana Pérez' }`; llamarlo 3 veces seguidas (simula previsualización de WhatsApp) no lo consume: después, `anon.auth.verifyOtp({ type: 'magiclink', token_hash })` devuelve sesión con `user.id === usuarioId`.
  - Tras `verifyOtp` + `marcarUsado` → `resolverEnlace` da `usado`; un segundo `verifyOtp` con el mismo hash falla.
  - Token aleatorio → `inexistente`; fila con `vence_en` en el pasado → `vencido`.
  - Atleta con `activo = false` → `sin_acceso`; consentimiento revocado → `sin_acceso`; `accesoVigente` → `false` en ambos.
  - `generarEnlace` deja una fila `registro_acceso` con `accion = 'generar_enlace'`.
- [ ] **Step 2:** `npm run test:integration` → FAIL.
- [ ] **Step 3:** Implementar. Si `type: 'magiclink'` está deprecado en la versión de supabase-js instalada, usar `type: 'email'` en `verifyOtp` y ajustar el test.
- [ ] **Step 4:** `npm run test:integration` → PASS.
- [ ] **Step 5:** Commit `Enlaces de acceso de un solo uso sin consumir en la previsualización`.

---

### Task 8: Pantallas de entrada y app autenticada

**Files:**
- Create: `app/(auth)/entrar/page.tsx`, `app/(auth)/entrar/actions.ts`, `app/(auth)/sin-acceso/page.tsx`, `lib/acceso/actual.ts`, `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/actions.ts`
- Delete: `app/page.tsx` (lo reemplaza `app/(app)/page.tsx`)

**Interfaces:**
- Consumes: Task 6 (clientes), Task 7 (`resolverEnlace`, `marcarUsado`, `accesoVigente`, `MENSAJES_ENLACE`).
- Produces:
  - `entrar(formData: FormData): Promise<void>` (Server Action, campo `t`) — `resolverEnlace`; si no ok, `redirect('/entrar?t=…')` para mostrar el motivo; si ok, `crearClienteServidor().auth.verifyOtp({ type: 'magiclink', token_hash: t })` (deja cookies), `marcarUsado`, `redirect('/')`.
  - `type UsuarioActual = { id: string; nombre: string; rol: 'remero' | 'entrenador' | 'admin'; atletaId: string | null }`
  - `obtenerUsuarioActual(): Promise<UsuarioActual | null>` (`lib/acceso/actual.ts`, `server-only`) — `getUser()` + `perfil`; devuelve `null` si no hay sesión o `accesoVigente` es falso.
  - `cerrarSesion(): Promise<void>` — `signOut()` y `redirect('/sin-acceso')`.

- [ ] **Step 1:** `/entrar` (Server Component): **solo lectura** — llama `resolverEnlace`; si ok muestra "Entrar como <nombre>" y un `<form action={entrar}>` con `<input type="hidden" name="t">` y un botón grande "Entrar"; si no, muestra `MENSAJES_ENLACE[motivo]`. Sin `t` → "Este enlace no es válido.". Nada en el GET llama `verifyOtp`.
- [ ] **Step 2:** `(app)/layout.tsx`: `obtenerUsuarioActual()`; si `null` y hay sesión, `signOut()`; luego `redirect('/sin-acceso')`.
- [ ] **Step 3:** `/sin-acceso`: "Para entrar necesitas un enlace de tu entrenador."
- [ ] **Step 4:** `(app)/page.tsx`: "Hola, <nombre>", dos botones grandes a ancho completo "Foto del ergómetro" y "Cargar a mano" (deshabilitados con texto "Pronto", se activan en fases 1–2), y "Cerrar sesión" pequeño abajo. Legible al lado del ergómetro: texto base ≥ 18 px, botones ≥ 64 px de alto.
- [ ] **Step 5:** `npm run build` pasa. La verificación a mano de este flujo se hace en Task 9, Step 3, cuando existan los scripts que generan enlaces. Allí se comprueba además: abrir el enlace con `curl` (GET) no lo consume; abrirlo en el navegador y tocar "Entrar" deja en `/`; recargar sigue dentro; abrirlo de nuevo muestra "ya se usó"; "Cerrar sesión" lleva a `/sin-acceso`.
- [ ] **Step 6:** Commit `Pantalla de entrada por enlace e inicio autenticado`.

---

### Task 9: Scripts de primer admin y enlace de atleta

**Files:**
- Create: `scripts/crear-admin.ts`, `scripts/enlace-atleta.ts`; Modify: `supabase/seed.sql`, `package.json`

**Interfaces:**
- Consumes: `crearUsuarioStaff`, `asegurarUsuarioAtleta`, `generarEnlace` (Task 7).
- Produces: `npm run crear-admin -- --nombre "Nombre"` y `npm run enlace:atleta -- --atleta <uuid>` (ambos `tsx --env-file=.env.local scripts/…`, imports relativos). Cada uno imprime solo la URL en la última línea. Leen `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`; fallan con mensaje claro si falta alguna. Para staging/prod se corre con un `.env` de ese entorno (`--env-file` configurable vía `ENV_FILE`).

- [ ] **Step 1:** `seed.sql`: dos atletas ficticios ("Atleta Uno", "Atleta Dos", fechas de nacimiento 2011 y 2005) con consentimiento `apoderado` / `propio`, `version_texto 'v0-pruebas'`. Imprimir sus ids fijos (uuid literales) en un comentario del seed para usarlos con el script.
- [ ] **Step 2:** Implementar ambos scripts.
- [ ] **Step 3:** Verificar: `npx supabase db reset`, `npm run crear-admin -- --nombre "Admin Local"` imprime una URL; abrirla con `npm run dev` y entrar → inicio dice "Hola, Admin Local". Repetir con `npm run enlace:atleta -- --atleta <id Atleta Uno>`.
- [ ] **Step 4:** Commit `Scripts para crear el primer admin y enlaces de atleta`.

---

### Task 10: PWA instalable

**Files:**
- Create: `app/manifest.ts`, `app/icons/[tam]/route.tsx`, `app/apple-icon.tsx`

**Interfaces:**
- Produces: `/manifest.webmanifest` con `name 'Regatapp'`, `short_name 'Regatapp'`, `lang 'es-CL'`, `start_url '/'`, `display 'standalone'`, `background_color` y `theme_color` iguales al fondo de la app, íconos `/icons/192` y `/icons/512` (`purpose 'any'`) y `/icons/512-maskable` (`purpose 'maskable'`, con margen de seguridad). Íconos generados con `ImageResponse` de `next/og` (sin archivos binarios ni dependencias nuevas); tamaños fuera de la lista → 404.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Verificar: `npm run build && npm start`; `curl -I localhost:3000/icons/192` → `200 image/png`; `curl localhost:3000/manifest.webmanifest` contiene los tres íconos; Chrome DevTools → Application → Manifest sin errores de instalabilidad.
- [ ] **Step 3:** Commit `Manifest e íconos de la PWA`.

---

### Task 11: CI, README y despliegue

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: scripts npm de Task 1, `env:local` de Task 3.

- [ ] **Step 1:** `ci.yml` en `push` y `pull_request`, Node LTS con caché npm:
  - Job `verificar`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build` (con variables públicas ficticias).
  - Job `integracion`: `supabase/setup-cli@v1`, `npx supabase start`, `npx supabase db reset`, `npm run env:local`, `npm run test:integration`.
- [ ] **Step 2:** `README.md` en español: requisitos (Node LTS, Docker Desktop, Git); arranque local en pasos numerados (`git clone`, `npm ci`, `npx supabase start`, `npx supabase db reset`, `npm run env:local`, `npm run crear-admin -- --nombre "…"`, `npm run dev`, abrir el enlace); cómo correr tests; entornos (local / staging / prod, tabla del spec §3); cómo aplicar migraciones a staging y prod con `npx supabase link` + `npx supabase db push`; variables por entorno en Vercel (Preview → staging, Production → prod); en cada proyecto Supabase remoto: `site_url`, `otp_expiry = 86400`, registro público desactivado.
- [ ] **Step 3:** Push a GitHub; CI en verde en los dos jobs.
- [ ] **Step 4 (con el usuario):** el usuario crea los proyectos Supabase staging y prod y el proyecto Vercel conectado al repo, y carga las variables. Aplicar migraciones a staging, crear el admin de staging con el script, abrir un preview deploy.
- [ ] **Step 5: Criterios de salida de la fase 0**
  - En una carpeta nueva, seguir el README desde `git clone` hasta entrar como admin, cronometrado: < 15 min (excluye la descarga inicial de imágenes Docker si el README lo advierte).
  - `npm run test:integration` en verde (incluye el test de RLS de `AGENTS.md`).
  - En el preview de Vercel: generar un enlace para un atleta de prueba de staging, mandarlo por WhatsApp, abrirlo desde el celular y entrar.
- [ ] **Step 6:** Commit `CI, README y guía de despliegue`.
