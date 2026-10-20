# Regatapp — Especificación de implementación

Documento de contexto para un agente de IA que implementa este proyecto.
Lee este archivo completo antes de escribir código. Si algo acá contradice
una instrucción del usuario en el chat, gana el usuario.

"Regatapp" es el nombre de trabajo. Si el usuario define otro, renómbralo
en todas partes.

> Las decisiones tomadas con el usuario después de escribir este archivo
> están en `docs/superpowers/specs/2026-10-20-regatapp-design.md`. Donde
> difieran, gana el diseño.

---

## 1. Qué se está construyendo

Una aplicación web para una asociación de remo que registra entrenamientos,
tests y competencias de sus atletas, y que puede leer resultados desde fotos
de la pantalla de ergómetros Concept2 (monitor PM5).

Usuarios: entrenadores y remeros. Ambos cargan datos.
Uso: celular junto al ergómetro y computador de escritorio.

### Lo que hace valioso al producto

La carga de datos tiene que ser más rápida que anotar en papel. Si cargar un
entrenamiento toma más de 30 segundos en el celular, el producto fracasa sin
importar qué tan correcto esté el resto. Prioriza esa ruta por sobre cualquier
otra consideración de diseño.

---

## 2. Stack (decidido, no re-evaluar)

| Capa | Elección |
| --- | --- |
| Frontend | Next.js (App Router), React, TypeScript |
| Estilos | Tailwind CSS |
| Backend / DB | Supabase (Postgres, Auth, Storage, RLS) |
| OCR | Modelo de visión vía API, invocado desde el servidor |
| Deploy | Vercel |
| PWA | Instalable, con manifest e íconos |

No es una app nativa. Es una PWA responsiva que sirve a celular y escritorio
con un solo código. La cámara se usa con `<input type="file" accept="image/*"
capture="environment">`.

### Reglas de stack

- TypeScript estricto. `strict: true`, sin `any` implícito.
- Las migraciones se versionan con el CLI de Supabase en `supabase/migrations/`.
  Nunca modificar el esquema desde el dashboard: el estado debe ser reproducible
  desde cero con `supabase db reset`.
- Las llamadas al modelo de visión van en una Route Handler o Edge Function.
  La API key jamás se expone al cliente.
- Validación de entrada con Zod, compartida entre cliente y servidor.

---

## 3. Convenciones de datos (críticas)

Estas tres decisiones ya están tomadas y el resto del sistema depende de ellas.

**Los tiempos se guardan en décimas de segundo, como `integer`.** El PM5 trabaja
en décimas. Usar segundos en punto flotante produce errores de redondeo al sumar
splits, y esos errores se notan cuando la suma de los parciales no cuadra con el
total. Formatea a `m:ss.d` solo en la capa de presentación.

**Una sola tabla `sesion` para entrenamiento, test y competencia.** Diferenciadas
por la columna `tipo`. Esto permite comparar un 2k de test contra un 2k de regata
sin unir tablas. No crear tablas separadas por tipo.

**El split /500m y los watts no se guardan, se derivan.** Existe la vista
`v_sesion_calculada`. La fórmula oficial de Concept2 es `watts = 2.80 / pace³`,
donde `pace` son segundos por metro. Guardar valores derivados genera
inconsistencias cuando alguien corrige el tiempo o la distancia.

---

## 4. Esquema de base de datos

Esta es la migración inicial. Impleméntala tal cual, salvo que el usuario
indique un cambio.

```sql
create type rol_usuario    as enum ('remero', 'entrenador', 'admin');
create type tipo_sesion    as enum ('entrenamiento', 'test', 'competencia');
create type modalidad      as enum ('ergometro', 'agua', 'gimnasio', 'otro');
create type origen_dato    as enum ('manual', 'ocr_foto', 'api_concept2');
create type categoria_peso as enum ('ligero', 'abierto');

create table atleta (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users(id) on delete set null,
  nombre           text not null,
  apellido         text not null,
  fecha_nacimiento date,
  sexo             text check (sexo in ('M','F','X')),
  peso_kg          numeric(5,2),
  altura_cm        integer,
  categoria_peso   categoria_peso,
  concept2_user_id text unique,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);

create table perfil (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  rol       rol_usuario not null default 'remero',
  atleta_id uuid references atleta(id)
);

create table asignacion_entrenador (
  entrenador_id uuid not null references auth.users(id) on delete cascade,
  atleta_id     uuid not null references atleta(id) on delete cascade,
  desde         date not null default current_date,
  hasta         date,
  primary key (entrenador_id, atleta_id, desde)
);

create table competencia (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  lugar        text,
  fecha_inicio date not null,
  fecha_fin    date,
  modalidad    modalidad not null default 'agua',
  notas        text
);

create table captura (
  id              uuid primary key default gen_random_uuid(),
  storage_path    text not null,
  subida_por      uuid references auth.users(id),
  subida_en       timestamptz not null default now(),
  modelo          text,
  respuesta_cruda jsonb,
  confianza       jsonb,
  editado_manual  boolean not null default false
);

create table sesion (
  id                 uuid primary key default gen_random_uuid(),
  atleta_id          uuid not null references atleta(id) on delete cascade,
  tipo               tipo_sesion not null,
  modalidad          modalidad not null default 'ergometro',
  competencia_id     uuid references competencia(id) on delete set null,
  fecha              timestamptz not null,
  distancia_m        integer,
  tiempo_ds          integer,
  spm_promedio       numeric(4,1),
  fc_promedio        integer,
  fc_maxima          integer,
  calorias           integer,
  factor_arrastre    integer,
  descripcion        text,
  rpe                integer check (rpe between 1 and 10),
  notas              text,
  origen             origen_dato not null default 'manual',
  verificado         boolean not null default false,
  concept2_result_id bigint unique,
  captura_id         uuid references captura(id) on delete set null,
  creado_por         uuid references auth.users(id),
  creado_en          timestamptz not null default now(),
  constraint chk_tiempo_positivo check (tiempo_ds is null or tiempo_ds > 0),
  constraint chk_dist_positiva   check (distancia_m is null or distancia_m > 0),
  constraint chk_competencia     check (competencia_id is null or tipo = 'competencia')
);

create index idx_sesion_atleta_fecha on sesion (atleta_id, fecha desc);
create index idx_sesion_tipo         on sesion (tipo, fecha desc);

create table split (
  id          uuid primary key default gen_random_uuid(),
  sesion_id   uuid not null references sesion(id) on delete cascade,
  orden       integer not null,
  distancia_m integer,
  tiempo_ds   integer not null,
  spm         numeric(4,1),
  fc          integer,
  descanso_ds integer,
  unique (sesion_id, orden)
);

create index idx_split_sesion on split (sesion_id, orden);

create view v_sesion_calculada as
select
  s.*,
  case when s.distancia_m > 0 and s.tiempo_ds > 0
    then round((s.tiempo_ds / 10.0) * 500.0 / s.distancia_m, 1)
  end as split_500_seg,
  case when s.distancia_m > 0 and s.tiempo_ds > 0
    then round(2.80 / power((s.tiempo_ds / 10.0) / s.distancia_m, 3))
  end as watts
from sesion s;
```

### Row Level Security

RLS se activa desde el primer commit, no después. Retrofitear RLS a una app ya
construida es un refactor largo y propenso a filtraciones.

Reglas:

- Un remero lee y escribe solo las sesiones de su propio `atleta_id`.
- Un entrenador accede a las sesiones de los atletas que tiene asignados y
  vigentes en `asignacion_entrenador`.
- Un admin accede a todo.
- `atleta`, `split` y `captura` siguen la misma lógica, derivada de la sesión
  o del atleta correspondiente.

Escribe un test de integración que verifique que un remero autenticado recibe
cero filas al consultar sesiones de otro atleta. Ese test es el criterio de
salida de la fase 0.

---

## 5. El contrato del OCR

### Regla de oro

Nada que venga de OCR se guarda sin confirmación humana. Toda sesión creada
desde una foto entra con `verificado = false` y `origen = 'ocr_foto'`. Las
sesiones no verificadas quedan excluidas de récords personales, curvas de
progreso y cualquier ranking. Se muestran en el listado con un indicador visual.

Razón: un "2:07.3" leído como "2:01.3" contamina el histórico del atleta y
después es muy difícil de encontrar.

### Flujo

1. El usuario saca o elige una foto.
2. Se sube a Supabase Storage y se crea una fila en `captura`.
3. Una Route Handler del servidor manda la imagen al modelo de visión.
4. La respuesta se guarda completa en `captura.respuesta_cruda`.
5. Se abre el formulario de sesión precargado con los valores leídos.
6. El usuario confirma o corrige. Al guardar, `verificado = true` y, si hubo
   cambios, `captura.editado_manual = true`.

### Esquema de respuesta esperado

Pide al modelo que devuelva exactamente esta forma, sin texto alrededor ni
cercas de markdown:

```json
{
  "distancia_m": 2000,
  "tiempo_ds": 4123,
  "spm_promedio": 28.5,
  "fc_promedio": 172,
  "calorias": 95,
  "factor_arrastre": 125,
  "splits": [
    { "orden": 1, "distancia_m": 500, "tiempo_ds": 1020, "spm": 29.0, "fc": 165 }
  ],
  "confianza": {
    "distancia_m": 0.98,
    "tiempo_ds": 0.95,
    "spm_promedio": 0.80,
    "fc_promedio": 0.40,
    "calorias": 0.90,
    "factor_arrastre": 0.70,
    "splits": 0.85
  }
}
```

Cualquier campo que no sea legible en la imagen va en `null`, no en cero. La
confianza va de 0 a 1 por campo. En la pantalla de confirmación, los campos
con confianza bajo 0.85 se resaltan para que el usuario los revise primero.

### Lo que no hay que hacer

No uses Tesseract ni OCR clásico. La pantalla del PM5 usa fuente de segmentos
LCD y el reconocimiento tradicional falla incluso con preprocesado. No inviertas
tiempo en pipelines de visión por computadora hechos a mano.

---

## 6. Integración con Concept2 Logbook

Concept2 ofrece una API oficial con OAuth. Cuando está disponible, es preferible
al OCR: los datos llegan estructurados y sin errores de transcripción.

- Documentación: https://log.concept2.com/developers/documentation/
- Desarrollo: log-dev.concept2.com
- Producción: requiere aprobación por correo a ranking@concept2.com

Endpoints relevantes: resultados del usuario autenticado, detalle de un
resultado, datos de palada, y exportación en csv/fit/tcx.

**Idempotencia:** `sesion.concept2_result_id` tiene restricción `unique`.
La importación debe poder correrse N veces sin duplicar nada. Usa
`insert ... on conflict (concept2_result_id) do update`.

Si la aprobación de producción no ha llegado, implementa solo lectura, que
no la requiere.

---

## 7. Fases y criterios de salida

Construye en este orden. No avances de fase sin cumplir el criterio.

### Fase 0 — Fundaciones
Repo, Next.js, Supabase, migraciones versionadas, auth, tabla `perfil`, RLS,
CI y deploy a Vercel con preview deploys.

*Criterio:* un desarrollador clona el repo en una máquina limpia, corre las
migraciones y levanta el entorno en menos de 15 minutos. Un test confirma que
un remero autenticado no puede leer sesiones de otro.

### Fase 1 — Carga manual
CRUD de atletas. Formulario de sesión con splits. Este formulario es el corazón
del producto: itéralo hasta que sea rápido de verdad en celular.

*Criterio:* un entrenador carga una sesión con 8 splits desde el celular en
menos de 30 segundos, sin instrucciones.

### Fase 2 — Progreso
Ficha del atleta: curva de split por distancia, récords personales, volumen
semanal. Solo con sesiones `verificado = true`.

*Criterio:* la ficha funciona sobre al menos 20 sesiones reales.

### Fase 3 — OCR
Lo descrito en la sección 5. La pantalla de confirmación reutiliza el formulario
de la fase 1; no escribas un segundo formulario.

*Criterio:* sobre un set de 50 fotos reales, 90% de los campos principales
(distancia, tiempo, split) salen correctos, y la corrección manual toma menos
de 15 segundos.

### Fase 4 — Sincronización Concept2
OAuth, importación idempotente, vinculación de cuentas.

*Criterio:* correr la importación dos veces seguidas no duplica sesiones.

### Fase 5 — Entrenador y competencias
Vista de grupo, comparación entre atletas, carga de resultados de regata,
exportación.

*Criterio:* un entrenador compara tres atletas en un mismo test y exporta el
resultado.

---

## 8. Datos personales

Si la asociación tiene remeros menores de edad, el sistema guarda datos
personales de niños: nombre, fecha de nacimiento, peso y rendimiento físico.
En Chile eso cae bajo la Ley 21.719 y requiere consentimiento de los apoderados
y una base de licitud definida.

Implicancias técnicas desde la fase 0:

- Registrar consentimiento como dato, con fecha y quién lo otorgó.
- Permitir exportar y eliminar todos los datos de un atleta.
- No guardar la foto original más allá de lo necesario; definir retención.
- Registro de accesos a datos de atletas por parte de terceros.

---

## 9. Antipatrones a evitar

- Guardar tiempos como `float` en segundos.
- Guardar split o watts como columnas en vez de derivarlos.
- Tablas separadas para entrenamiento, test y competencia.
- Mostrar sesiones no verificadas en récords o curvas de progreso.
- Llamar al modelo de visión desde el cliente.
- Cambiar el esquema desde el dashboard de Supabase.
- Construir el OCR antes que el formulario manual.
- Agregar features de la fase 5 antes de que haya datos reales acumulados.

---

## 10. Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo servidor
ANTHROPIC_API_KEY=                # solo servidor, para el OCR
CONCEPT2_CLIENT_ID=
CONCEPT2_CLIENT_SECRET=
CONCEPT2_BASE_URL=                # log-dev o log según entorno
```

---

## 11. Cómo trabajar

- Un commit por unidad coherente de trabajo, con mensaje en español.
- Tests para la lógica de dominio: conversión de tiempos, cálculo de split,
  derivación de watts, idempotencia de la importación, y las políticas RLS.
- Antes de agregar una dependencia, verifica que no haya una forma razonable
  de resolverlo con lo que ya está en el stack.
- Si una decisión de este documento te parece equivocada mientras implementas,
  dilo explícitamente en vez de desviarte en silencio.
