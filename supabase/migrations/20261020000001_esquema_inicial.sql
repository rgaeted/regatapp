-- Esquema inicial de Regatapp (AGENTS.md §4 + docs/superpowers/specs/2026-10-20-regatapp-design.md §5)

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

-- Diseño §5.3: los entrenadores no tienen fila en atleta
alter table perfil add column nombre text not null default '';

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

-- Diseño §5.4: retención de fotos
alter table captura add column foto_eliminada_en timestamptz;

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

-- Diseño §5.1: security_invoker para que la vista respete RLS
create view v_sesion_calculada with (security_invoker = true) as
select
  s.*,
  case when s.distancia_m > 0 and s.tiempo_ds > 0
    then round((s.tiempo_ds / 10.0) * 500.0 / s.distancia_m, 1)
  end as split_500_seg,
  case when s.distancia_m > 0 and s.tiempo_ds > 0
    then round(2.80 / power((s.tiempo_ds / 10.0) / s.distancia_m, 3))
  end as watts
from sesion s;

-- Diseño §5.2: Ley 21.719
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

-- Diseño §5.3
create table enlace_acceso (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,     -- hashed_token de Supabase
  creado_por  uuid references auth.users(id),
  creado_en   timestamptz not null default now(),
  vence_en    timestamptz not null,
  usado_en    timestamptz
);

-- RLS activa en todas las tablas desde el primer commit (las políticas llegan en la Task 4)
alter table atleta                enable row level security;
alter table perfil                enable row level security;
alter table asignacion_entrenador enable row level security;
alter table competencia           enable row level security;
alter table captura               enable row level security;
alter table sesion                enable row level security;
alter table split                 enable row level security;
alter table consentimiento        enable row level security;
alter table registro_acceso       enable row level security;
alter table enlace_acceso         enable row level security;
