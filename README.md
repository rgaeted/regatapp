# Regatapp

Aplicación web (PWA) para una asociación de remo: registra entrenamientos, tests
y competencias de sus atletas, y en fases posteriores lee resultados desde fotos
del monitor PM5 de Concept2. Entrenadores y remeros cargan datos desde el
celular junto al ergómetro o desde el computador.

Stack: Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres, Auth,
Storage, RLS), Vercel. Fase actual: 0 (fundaciones).

## Requisitos

- Node.js LTS (24; CI usa 24)
- Docker Desktop, corriendo (Supabase local)
- Git

## Arranque local

La primera vez, `npx supabase start` descarga las imágenes de Docker (varios
minutos según la conexión); los arranques siguientes son rápidos.

1. `git clone <url-del-repositorio> regatapp && cd regatapp`
2. `npm ci`
3. `npx supabase start`
4. `npx supabase db reset` (aplica las migraciones de `supabase/migrations/` y `seed.sql`)
5. `npm run env:local` (escribe `.env.local` con las claves del Supabase local)
6. `npm run crear-admin -- --nombre "Tu Nombre"` (crea el primer admin e imprime un enlace de acceso)
7. `npm run dev`
8. Abre en el navegador el enlace impreso en el paso 6 (`http://localhost:3000/entrar?t=...`).

El enlace es de un solo uso y vale 24 horas. Cada `npm run crear-admin -- --nombre "…"`
crea un admin nuevo con su propio enlace (no hace falta resetear la base). Para un
atleta existente: `npm run enlace:atleta -- --atleta <uuid>` (los ids de los atletas
de prueba están en `supabase/seed.sql`). Si pierdes el enlace de un admin, crea otro
admin; todavía no hay script para regenerar el enlace de uno existente.

## Tests

- `npm run test:unit`: lógica de dominio, sin base de datos.
- `npm run test:integration`: políticas RLS y acceso, contra el Supabase local
  (pasos 3 a 5 de arriba). Crean y borran datos de prueba.
- Sin Docker, se puede correr contra un proyecto Supabase **de desarrollo**
  dedicado, nunca contra staging ni prod: en `.env.local` apunta
  `NEXT_PUBLIC_SUPABASE_URL` y las claves a ese proyecto y define
  `ALLOW_REMOTE_TESTS=1` y `SUPABASE_PROJECT_REF=<ref del proyecto dev>`.
  Los tests rechazan cualquier otro host remoto.
- Otros chequeos: `npm run lint`, `npm run typecheck`, `npm run build`. El CI
  (`.github/workflows/ci.yml`) corre todo en cada push y PR.

## Entornos

| Entorno | Base de datos | Para qué |
| --- | --- | --- |
| Local | Supabase local (`supabase start`, requiere Docker) | Desarrollo y tests de RLS |
| Preview (Vercel) | Proyecto Supabase "staging" | Probar ramas sin tocar datos reales de menores |
| Producción (Vercel) | Proyecto Supabase "prod" | Datos reales |

### Migraciones en staging y prod

Las aplica una persona; no hay despliegue automático del esquema. El esquema
solo cambia mediante migraciones en `supabase/migrations/`, nunca desde el
dashboard de Supabase.

```
npx supabase login                       # o define SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref <ref>    # staging o prod
npx supabase db push
```

Antes de cada `db push`, confirma con `npx supabase projects list` (o el `ref`
que acabas de enlazar) que apuntas al proyecto correcto.

### Ajustes de Auth en cada proyecto remoto

`supabase/config.toml` solo rige el entorno local. En cada proyecto remoto (staging
y prod) hay que dejar estos ajustes equivalentes, con `npx supabase config push`
o desde el dashboard en Authentication (el dashboard es aceptable para
**ajustes de Auth**; el esquema siempre por migraciones):

- Site URL: la URL del sitio de ese entorno (y esa misma en las redirect URLs permitidas).
- Duración del enlace/OTP: `otp_expiry = 86400` (24 h, en el dashboard "Email OTP Expiration").
- Registro público desactivado (`enable_signup = false`; en el dashboard, desactivar "Allow new users to sign up").
- Sin límite de duración de sesión ni de inactividad (`[auth.sessions]` sin `timebox` ni `inactivity_timeout`).

### Variables de entorno en Vercel

El proyecto de Vercel está conectado al repositorio de GitHub. Cada variable se
define por entorno de Vercel: **Preview** apunta al proyecto Supabase de staging
y **Production** al de prod.

| Variable | Alcance | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | pública | URL del proyecto Supabase del entorno |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública | clave anónima del proyecto |
| `NEXT_PUBLIC_SITE_URL` | pública | URL base del sitio, para armar los enlaces de acceso. Obligatoria en **todos** los entornos: la app falla al iniciar sin ella |
| `SUPABASE_SERVICE_ROLE_KEY` | solo servidor | nunca con prefijo `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | solo servidor | desde la fase de OCR |
| `OCR_MODEL` | solo servidor | valor inicial `claude-sonnet-5-5` |
| `CRON_SECRET` | solo servidor | cualquier texto largo y aleatorio; sin él el cron diario de retención de fotos (`vercel.json`) responde 401 y las fotos sin confirmar no se borran a los 7 días |
| `CONCEPT2_CLIENT_ID` | solo servidor | fase 4 |
| `CONCEPT2_CLIENT_SECRET` | solo servidor | fase 4 |
| `CONCEPT2_BASE_URL` | solo servidor | `log-dev` o `log` según entorno (fase 4) |

En Preview, `NEXT_PUBLIC_SITE_URL` debe ser la URL del deploy desde donde se
generan los enlaces (los previews cambian de URL; usa el dominio estable de la
rama o ajústala antes de mandar enlaces).

### Primer admin en staging o prod

El script rechaza por defecto cualquier URL que no sea local. Crea un archivo
`.env.staging` (o `.env.prod`) con las variables de ese entorno
(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`;
los archivos `.env*` están en `.gitignore`) y ejecuta:

```
ENV_FILE=.env.staging CONFIRMAR_PRODUCCION=1 npm run crear-admin -- --nombre "Tu Nombre"
```

(En PowerShell: `$env:ENV_FILE=".env.staging"; $env:CONFIRMAR_PRODUCCION="1"; npm run crear-admin -- --nombre "Tu Nombre"`.)

La URL que imprime es un enlace de acceso de un solo uso, válido 24 horas:
mándalo solo por un canal privado (WhatsApp directo a la persona). Quien lo abra
primero entra como ese admin.

## Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo viven en el servidor;
  nunca en código cliente ni con prefijo `NEXT_PUBLIC_`.
- No se commitea ningún `.env*` salvo `.env.example` (sin valores secretos).
  `.env.supabase` (token del CLI de Supabase) tampoco debe subirse jamás.
- Los enlaces de acceso son de un solo uso y caducan; generar un enlace nuevo para el mismo usuario invalida el anterior.
- Las tablas tienen RLS desde la primera migración; los tests de integración
  verifican que un remero no ve datos de otro atleta.

## Estructura

```
app/                  rutas (App Router), manifest y PWA
lib/                  dominio: tiempos, acceso por enlace, esquemas Zod, clientes Supabase
scripts/              crear-admin, enlace-atleta, env-local
supabase/             config.toml, migrations/, seed.sql
tests/unit, tests/integration
docs/superpowers/     especificación de diseño y planes
docs/legal/           textos de consentimiento versionados
.github/workflows/    CI
```

## Documentación

- `AGENTS.md`: especificación original y convenciones de datos.
- `docs/superpowers/specs/2026-10-20-regatapp-design.md`: decisiones de diseño (gana sobre `AGENTS.md` si difieren).
- `docs/superpowers/plans/`: plan de implementación por fases.
