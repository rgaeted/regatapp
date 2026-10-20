# Regatapp — Diseño

Fecha: 2026-10-20
Base: `AGENTS.md` (especificación original). Este documento registra lo que
se decidió con el usuario después y las decisiones de implementación que la
especificación dejaba abiertas. Donde difieran, gana este documento.

Convención de marcas:
- **[usuario]** lo dijo el usuario.
- **[AGENTS]** viene de `AGENTS.md`.
- **[decisión]** lo decidió quien escribe el diseño; el usuario puede revertirlo.

---

## 1. Intención

Una asociación de remo con unos 30 remeros, casi todos menores de edad
**[usuario]**, hoy **no registra** los resultados de entrenamientos ni tests
**[usuario]**. El resultado aparece en la pantalla del ergómetro y se pierde.

El producto existe para que ese resultado quede guardado con el menor esfuerzo
posible. La forma que el usuario tiene en la cabeza es: **sacar una foto a la
pantalla del PM5 y que la app la lea** **[usuario]**.

Como la alternativa real es "no anotar nada", cualquier fricción hace que no
se use. El objetivo de velocidad de `AGENTS.md` (menos de 30 segundos por
sesión en el celular) es la vara principal.

### Qué es éxito

- Los remeros y entrenadores registran tests y entrenamientos de ergómetro
  habitualmente, sobre todo con foto.
- Lo registrado es confiable: nada leído por OCR entra al histórico sin que un
  humano lo confirme **[AGENTS]**.
- Los datos de los menores están protegidos: nadie ve lo que no le corresponde,
  hay consentimiento registrado y se pueden exportar y borrar **[AGENTS]**.

### Objetivos

1. Registrar una sesión desde una foto del PM5 en pocos toques.
2. Registrar una sesión a mano, rápido, cuando no hay foto.
3. Que cada remero vea su propio progreso; que el entrenador vea el de sus
   atletas.
4. Cumplir con lo mínimo técnico de la Ley 21.719 para datos de menores.

### No objetivos (por ahora)

- App nativa. Es una PWA **[AGENTS]**.
- Funcionamiento sin conexión (offline). La PWA es instalable pero requiere red
  **[decisión]**.
- Rankings públicos o compartir fuera de la asociación.
- Escritura hacia Concept2 Logbook (solo lectura, ver §10) **[AGENTS]**.
- Funciones de la fase de entrenador/competencias antes de tener datos reales
  **[AGENTS]**.
- Asesoría legal: la app guarda el consentimiento; el texto lo redacta la
  asociación **[decisión]**.

### Antiobjetivos (sería un fracaso aunque funcione)

- Cargar una sesión toma más de 30 segundos en el celular.
- Un valor mal leído por OCR termina en récords o curvas sin que nadie lo
  haya confirmado.
- Un remero ve datos de otro remero, o un tercero ve datos de un menor sin
  quedar registrado.
- Un menor necesita correo, contraseña o un proceso de registro para entrar.

---

## 2. Usuarios y acceso

### Roles **[AGENTS]**

| Rol | Ve y edita |
| --- | --- |
| `remero` | Sus propias sesiones, splits y capturas. Su propia ficha (solo lectura). |
| `entrenador` | Atletas asignados y vigentes en `asignacion_entrenador`, y todo lo de ellos. |
| `admin` | Todo. Crea entrenadores, asigna atletas, ve el registro de accesos. |

### Los remeros, incluidos los menores, tienen acceso propio **[usuario]**

Tiene que ser "lo más simple posible" **[usuario]**. Diseño **[decisión]**:

1. Un entrenador o admin crea al atleta en la app, y en el mismo formulario
   registra el consentimiento (ver §5.2). **No se puede crear un atleta sin
   consentimiento**, porque guardar su nombre ya es tratar sus datos. Si el
   consentimiento se revoca, se bloquea el acceso y la carga de sesiones
   nuevas, y se ofrece eliminar sus datos **[decisión]**.
2. Toca "Generar enlace de acceso". La app crea (o reutiliza) el usuario de
   Supabase Auth del atleta y genera un enlace de un solo uso.
3. El entrenador lo comparte por WhatsApp con el botón de compartir del celular.
4. El remero abre el enlace, ve su nombre y toca **"Entrar"**. Queda con la
   sesión iniciada en ese navegador por meses.
5. Si pierde el celular o cierra sesión, el entrenador genera otro enlace.

Sin contraseña, sin correo del remero, sin formulario de registro.

#### Mecánica técnica **[decisión]**

- Cada atleta con acceso tiene un usuario en `auth.users` con un **correo
  sintético** que nadie lee, por ejemplo `a-<atleta_id>@remeros.invalid`.
  Se crea con `auth.admin.createUser({ email, email_confirm: true })` desde el
  servidor (service role). *Quien implemente debe verificar que GoTrue acepte
  ese dominio; si no, usar un subdominio controlado por el proyecto.*
- El enlace se genera con `auth.admin.generateLink({ type: 'magiclink', email })`
  en el servidor. No se usa el `action_link` de Supabase; se toma
  `properties.hashed_token` y se arma una URL propia:
  `https://<app>/entrar?t=<hashed_token>`.
- **El token no se consume en el GET.** WhatsApp y otros servicios
  previsualizan los enlaces haciendo un GET; si el GET consumiera el token, el
  enlace llegaría muerto. La página `/entrar` muestra "Entrar como <nombre>" y
  el botón hace un POST a una Server Action que llama
  `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` y deja las
  cookies de sesión.
  - Para mostrar el nombre sin consumir el token, la página resuelve el nombre
    a partir de una fila propia `enlace_acceso` (ver §5) y no a partir del token
    de Supabase.
- Vencimiento del enlace: 24 horas (`otp_expiry` máximo de Supabase).
  Un solo uso.
- Duración de la sesión: refresh tokens sin vencimiento por inactividad y
  cookie persistente (por defecto en `@supabase/ssr`). Revisar `config.toml`
  para que no haya un límite de sesión configurado.
- Costo aceptado: quien tenga un enlace sin usar entra como ese remero. Se
  mitiga con un solo uso y 24 horas de vigencia.
- Revocar acceso: el admin o entrenador puede "cerrar todas las sesiones" de un
  atleta (`auth.admin.signOut` sobre el usuario o borrar sus sesiones), y
  desactivar al atleta (`atleta.activo = false` → la app rechaza la entrada).

### Entrenadores y admins **[decisión]**

Entran con **el mismo mecanismo de enlace**. Así no hace falta configurar un
servidor de correo: el SMTP incluido en Supabase solo envía a miembros del
equipo del proyecto y con límites muy bajos, así que no sirve para invitar
gente externa.

- El admin crea al entrenador en la app (nombre y, si quiere, correo real),
  genera su enlace y se lo manda por WhatsApp.
- El primer admin se crea con `scripts/crear-admin.ts` (service role), que
  imprime en la terminal un enlace de entrada.
- Si más adelante se configura SMTP propio (p. ej. Resend), los entrenadores
  podrán entrar también con código por correo. No es parte de la fase 0.

### Alta de usuario → `perfil`

Al crear un usuario se crea su fila en `perfil`. Para remeros, la Server
Action que genera el enlace crea `perfil(rol='remero', atleta_id=<atleta>)` y
asigna `atleta.user_id`. Para entrenadores, el alta que hace el admin crea
`perfil(rol='entrenador')`. No se usa un trigger en `auth.users`, porque el rol
depende de quién invita **[decisión]**.

---

## 3. Stack y entorno

Stack de `AGENTS.md` §2, sin re-evaluar: Next.js (App Router) + React +
TypeScript estricto, Tailwind, Supabase, Vercel, PWA, Zod.

Precisiones **[decisión]**:

- Versiones: las últimas estables al iniciar (`create-next-app@latest`).
- Cliente Supabase: `@supabase/supabase-js` + `@supabase/ssr` (cookies en
  Server Components, Server Actions y middleware).
- Tests: Vitest para lógica de dominio e integración (RLS contra Supabase
  local). Sin Playwright en la fase 0.
- Interfaz en español de Chile. Fechas en zona horaria `America/Santiago`.
- OCR: API de Anthropic desde una Route Handler. El modelo va en una variable
  de entorno (`OCR_MODEL`), con valor inicial `claude-sonnet-5-5`.
- PWA: `app/manifest.ts` + íconos. Sin service worker en la fase 0.

### Entornos **[decisión]**

| Entorno | Base de datos | Para qué |
| --- | --- | --- |
| Local | Supabase local (`supabase start`, requiere Docker) | Desarrollo y tests de RLS |
| Preview (Vercel) | Proyecto Supabase "staging" | Probar ramas sin tocar datos reales de menores |
| Producción | Proyecto Supabase "prod" | Datos reales |

Las migraciones se aplican a staging y prod con `supabase db push`, ejecutado
por una persona, documentado en el README. Automatizarlo queda para después.

### CI **[decisión]**

GitHub Actions en cada push y PR: `npm ci`, lint, typecheck, tests unitarios,
y luego `supabase start` + `supabase db reset` + tests de integración (RLS).
Vercel conectado al repo de GitHub para previews.

---

## 4. Convenciones de datos

Se mantienen las tres de `AGENTS.md` §3 sin cambios: tiempos en décimas como
`integer`, una sola tabla `sesion`, split y watts derivados en
`v_sesion_calculada`.

### Formato y entrada de tiempos **[decisión]**

Para que tipear un tiempo en el celular sea rápido, el campo de tiempo usa el
teclado numérico (`inputmode="numeric"`) y acepta **solo dígitos**, que se
formatean a medida que se escriben, de derecha a izquierda:

Regla: el último dígito son décimas, los dos anteriores son segundos, el resto
son minutos. Si los minutos llegan a 60 o más, se muestra `h:mm:ss.d`.

| Tecleado | Se muestra | `tiempo_ds` |
| --- | --- | --- |
| `5` | `0.5` | 5 |
| `1023` | `1:02.3` | 623 |
| `7035` | `7:03.5` | 4235 |
| `10203` | `10:20.3` | 6203 |
| `70355` | `1:10:35.5` | 42355 |

Si los segundos tecleados son 60 o más (p. ej. `1753` → "1:75.3"), el campo se
marca inválido.

También se aceptan al pegar o en escritorio los formatos `m:ss.d`, `m:ss`,
`h:mm:ss.d`. Todo esto vive en `lib/tiempo.ts` con tests:

- `parseTiempo(texto): number | null` → décimas.
- `formatTiempo(ds): string` → `m:ss.d` o `h:mm:ss.d`.
- `split500(tiempo_ds, distancia_m): number` → décimas por 500 m.
- `watts(tiempo_ds, distancia_m): number` → `2.80 / pace³`.

Las funciones de `lib/tiempo.ts` y la vista SQL deben coincidir; un test
compara ambos cálculos sobre los mismos casos.

---

## 5. Esquema de base de datos

Se implementa la migración de `AGENTS.md` §4 **tal cual**, con estos cambios.
Cada uno se explica porque `AGENTS.md` pide decir explícitamente cuándo se
desvía.

### 5.1 Corrección: la vista debe respetar RLS

En Postgres una vista se ejecuta por defecto con los permisos de su dueño, lo
que **salta RLS**. Con la vista tal como está escrita, un remero podría leer
las sesiones de todos a través de `v_sesion_calculada`. Se crea con:

```sql
create view v_sesion_calculada with (security_invoker = true) as ...
```

El test de RLS cubre también la vista.

### 5.2 Tablas nuevas por Ley 21.719 (exigidas por `AGENTS.md` §8)

```sql
create table consentimiento (
  id                  uuid primary key default gen_random_uuid(),
  atleta_id           uuid not null references atleta(id) on delete cascade,
  otorgado_por_nombre text not null,
  otorgado_por_rut    text,
  relacion            text not null check (relacion in ('apoderado','tutor_legal','propio')),
  medio               text not null check (medio in ('papel','digital')),
  version_texto       text not null,          -- p. ej. 'v1', apunta a docs/legal/
  otorgado_en         date not null,
  revocado_en         timestamptz,
  registrado_por      uuid references auth.users(id),
  creado_en           timestamptz not null default now()
);

create table registro_acceso (
  id         bigint generated always as identity primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  atleta_id  uuid references atleta(id) on delete set null,
  accion     text not null,   -- 'ver_ficha' | 'ver_sesiones' | 'exportar' | 'eliminar' | 'generar_enlace' | ...
  detalle    jsonb,
  en         timestamptz not null default now()
);
```

- Consentimiento vigente = existe una fila con `revocado_en is null`.
- Para menores (o atletas sin `fecha_nacimiento`), la relación debe ser
  `apoderado` o `tutor_legal` **[decisión]**. Para mayores de edad puede ser
  `propio`.
- `registro_acceso` es **solo inserción**: se escribe con una función
  `security definer` `registrar_acceso(atleta_id, accion, detalle)` que toma
  `auth.uid()`. Nadie puede modificar ni borrar filas; solo el admin las lee.
- Se registra cuando alguien que **no es el propio atleta** abre la ficha o el
  listado de sesiones de un atleta, exporta, elimina o genera un enlace. Los
  accesos del propio atleta no se registran **[decisión]**.

### 5.3 Tabla nueva para los enlaces de acceso

```sql
create table enlace_acceso (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,     -- hashed_token de Supabase
  creado_por  uuid references auth.users(id),
  creado_en   timestamptz not null default now(),
  vence_en    timestamptz not null,
  usado_en    timestamptz
);

alter table perfil add column nombre text not null default '';
```

`enlace_acceso` sirve para mostrar "Entrar como <nombre>" sin consumir el
token y para saber qué enlaces quedan vivos. Sirve para remeros, entrenadores
y admins. Sin acceso para `anon` ni `authenticated`; la lee el servidor con
service role. Se agrega `perfil.nombre` porque los entrenadores no tienen fila
en `atleta` y hay que mostrar su nombre.

### 5.4 Retención de fotos

Se agrega a `captura`:

```sql
alter table captura add column foto_eliminada_en timestamptz;
```

Política **[decisión]**: la foto se borra de Storage al confirmar la sesión, o
a los 7 días si nunca se confirmó. `storage_path` se conserva como referencia
y `respuesta_cruda` se guarda. El borrado periódico lo hace un job programado
(Vercel Cron o `pg_cron`), que se implementa en la fase de OCR.

*Excepción:* el set de 50 fotos para medir la precisión del OCR (criterio de
salida de esa fase) se arma aparte, con consentimiento explícito para ese uso,
y no vive en el bucket de producción.

### 5.5 Storage

Bucket privado `capturas`. Ruta `<user_id>/<captura_id>.<ext>`. Política: cada
usuario sube y lee solo en su carpeta; el servidor (service role) lee para
mandar la imagen al modelo.

---

## 6. Row Level Security

Activa en todas las tablas desde la primera migración **[AGENTS]**.

### Funciones auxiliares (`security definer`, `stable`, `search_path` fijo) **[decisión]**

- `es_admin()` → el `perfil.rol` del usuario actual es `admin`.
- `mi_atleta_id()` → `perfil.atleta_id` del usuario actual.
- `entrena_a(atleta uuid)` → existe una asignación del usuario actual con
  `desde <= current_date and (hasta is null or hasta >= current_date)`.
- `puede_ver_atleta(atleta uuid)` → `es_admin() or atleta = mi_atleta_id() or entrena_a(atleta)`.

### Políticas

| Tabla | Leer | Escribir |
| --- | --- | --- |
| `perfil` | el propio; admin todos; entrenador los de sus atletas | solo admin (las altas las hace el servidor) |
| `atleta` | `puede_ver_atleta(id)` | entrenador de ese atleta o admin; crear: entrenador o admin **[decisión]** (el remero no edita su ficha) |
| `asignacion_entrenador` | admin; el entrenador ve las suyas | admin |
| `sesion` | `puede_ver_atleta(atleta_id)` | igual que leer, más `creado_por = auth.uid()` al insertar y consentimiento vigente del atleta |
| `split` | vía la sesión | vía la sesión |
| `captura` | `subida_por = auth.uid()`, o una sesión visible la referencia, o admin | insertar: `subida_por = auth.uid()` |
| `competencia` | todos los autenticados | entrenador o admin |
| `consentimiento` | `puede_ver_atleta(atleta_id)` excepto el propio remero **[decisión]** | entrenador del atleta o admin |
| `registro_acceso` | admin | nadie directo; solo vía `registrar_acceso()` |
| `enlace_acceso` | nadie (solo service role) | nadie (solo service role) |

Al crear al atleta, el entrenador que lo crea queda asignado automáticamente
(si no, no podría verlo) **[decisión]**.

### Tests de integración (criterio de salida de la fase 0)

Contra Supabase local, con usuarios reales creados por service role:

1. Un remero autenticado recibe **cero filas** al consultar `sesion` y
   `v_sesion_calculada` de otro atleta **[AGENTS]**.
2. Un remero no puede insertar una sesión con el `atleta_id` de otro.
3. Un entrenador ve a su atleta asignado y no a uno no asignado; deja de verlo
   cuando la asignación vence (`hasta` en el pasado).
4. Un admin ve todo.
5. Un remero no puede leer `registro_acceso` ni `enlace_acceso`.

---

## 7. Carga de sesiones (el corazón)

### Ruta principal: foto

Pantalla de inicio del remero (y del entrenador) con dos botones grandes:
**"Foto del ergómetro"** y **"Cargar a mano"** **[decisión]**.

Flujo de foto (detalle en la fase de OCR, siguiendo `AGENTS.md` §5):
foto → subida + fila `captura` → Route Handler llama al modelo → respuesta
cruda guardada → **el mismo formulario manual** precargado, con los campos de
confianza < 0.85 resaltados → el usuario confirma → `verificado = true`,
`origen = 'ocr_foto'`, `editado_manual = true` si cambió algo.

Se ofrece además "Guardar sin revisar", que guarda con `verificado = false`.
Esas sesiones salen en el listado con un indicador y quedan fuera de récords
y curvas hasta que alguien las confirma **[decisión, para cumplir la regla de oro]**.

### Formulario manual **[decisión]**

Pensado para menos de 30 segundos con 8 splits en el celular:

- Valores por defecto: atleta = el propio (remero) o el último usado
  (entrenador); `tipo = entrenamiento`; `modalidad = ergometro`;
  `fecha = ahora`.
- Distancia con chips de un toque (500, 1000, 2000, 5000, 6000) y campo libre.
- Tiempo total con la entrada de dígitos de §4.
- Splits: elegir cantidad (chips 4 / 5 / 8 / otra). La distancia de cada split
  se completa sola (`distancia / n`). Solo se tipean los tiempos, saltando de
  un campo al siguiente con "siguiente" del teclado.
- Si la suma de splits no coincide con el total, aviso visible, no bloqueo.
- Campos secundarios (spm, FC, calorías, drag, RPE, notas) plegados bajo
  "Más datos".
- Un solo botón "Guardar", fijo abajo en el celular.
- Lo cargado a mano lo tipeó una persona, así que se guarda con
  `verificado = true` y `origen = 'manual'`. La columna mantiene
  `default false` para que cualquier otra vía de entrada parta sin verificar.
- Validación con un esquema Zod compartido (`lib/schemas/sesion.ts`).

Se itera con pruebas reales cronometradas hasta cumplir los 30 segundos
**[AGENTS]**.

---

## 8. Orden de fases

El usuario prioriza la foto **[usuario]**. Se mantiene la regla de `AGENTS.md`
de no hacer el OCR antes que el formulario manual, pero el progreso pasa
después del OCR **[decisión, presentada al usuario sin objeción]**. Es un
cambio respecto del orden de `AGENTS.md` §7.

| # | Fase | Contenido | Criterio de salida |
| --- | --- | --- | --- |
| 0 | Fundaciones | Repo, Next.js, Supabase local, migraciones (incluye §5 completo), RLS, acceso por enlace para todos los roles, script del primer admin, consentimiento como dato, PWA instalable, CI, deploy a Vercel con previews | **[AGENTS]** clonar y levantar en < 15 min; test de RLS en verde. Además: un remero entra con un enlace abierto desde WhatsApp |
| 1 | Carga manual | CRUD de atletas (con consentimiento y enlace), formulario de sesión con splits, listado de sesiones, exportar y eliminar todos los datos de un atleta | **[AGENTS]** sesión con 8 splits en < 30 s en el celular, sin instrucciones |
| 2 | OCR | `AGENTS.md` §5 sobre el formulario de la fase 1; retención de fotos (§5.4) | **[AGENTS]** 90 % de distancia, tiempo y split correctos en 50 fotos reales; corrección < 15 s |
| 3 | Progreso | Ficha: curva de split por distancia, récords, volumen semanal; solo `verificado = true`; registra accesos | **[AGENTS]** funciona con ≥ 20 sesiones reales |
| 4 | Concept2 | OAuth, importación idempotente (`on conflict (concept2_result_id) do update`), vinculación | **[AGENTS]** dos importaciones seguidas no duplican |
| 5 | Entrenador y competencias | Vista de grupo, comparación, regatas, exportación | **[AGENTS]** comparar 3 atletas en un test y exportar |

### Exportar y eliminar datos de un atleta (fase 1)

- **Exportar**: JSON con el atleta, sus sesiones, splits, capturas (sin la
  foto si ya se borró), consentimientos y su registro de accesos.
- **Eliminar**: borra al atleta (en cascada sesiones, splits, consentimientos,
  enlaces), sus fotos de Storage y su usuario de Auth. Las filas de
  `registro_acceso` quedan con `atleta_id = null` y se agrega una fila
  `eliminar` **[decisión]**. Solo admin.

---

## 9. Estructura del repo **[decisión]**

```
app/                    rutas (App Router)
  (auth)/entrar/        canje del enlace del remero
  (app)/                rutas autenticadas
  manifest.ts
components/
lib/
  tiempo.ts             parse/format/split/watts
  schemas/              Zod compartido
  supabase/             clientes server/browser/admin
supabase/
  config.toml
  migrations/
  seed.sql              datos de prueba locales (sin datos reales)
scripts/crear-admin.ts
tests/
  unit/
  integration/          RLS
docs/
  superpowers/specs/
  legal/                textos de consentimiento versionados (los redacta la asociación)
.github/workflows/ci.yml
```

---

## 10. Variables de entorno

Las de `AGENTS.md` §10, más:

```
OCR_MODEL=claude-sonnet-5-5   # solo servidor
NEXT_PUBLIC_SITE_URL=         # para armar los enlaces de acceso
```

Concept2: solo lectura hasta que llegue la aprobación de producción **[AGENTS]**.

---

## 11. Lo que queda a criterio de quien implementa

- Diseño visual (dentro de Tailwind), siempre que la carga sea rápida en el
  celular y se lea bien al lado del ergómetro.
- Estructura interna de componentes.
- El prompt exacto del OCR, siempre que devuelva el esquema de `AGENTS.md` §5.
- Cómo se organizan los commits, siempre en español y por unidad coherente.

## 12. Dependencias externas que pone el usuario

- Docker Desktop (para Supabase local y los tests de RLS).
- Cuenta de GitHub (repo y CI), Supabase (staging y prod), Vercel.
- Clave de la API de Anthropic (desde la fase de OCR).
- Texto del consentimiento para apoderados (lo redacta la asociación).
