-- Endurecimiento final de la fase 0 (revisión de toda la rama). Las migraciones
-- 000001–000004 ya están aplicadas: todo cambio va acá.
--
-- Mismo criterio de "cliente" que la 000003: current_user in ('authenticated','anon').
-- Quedan exentos el service_role, postgres (migraciones, acciones de FK) y las
-- funciones security definer (current_user = su dueño).

-- ---------------------------------------------------------------------------
-- (a) FK sin ON DELETE: borrar un atleta, o el usuario de Auth de un remero o
-- entrenador, fallaba si había creado sesiones, capturas, consentimientos o
-- enlaces. Ahora la referencia queda en NULL y el dato se conserva.
-- ---------------------------------------------------------------------------
alter table sesion drop constraint sesion_creado_por_fkey,
  add constraint sesion_creado_por_fkey
  foreign key (creado_por) references auth.users(id) on delete set null;

alter table captura drop constraint captura_subida_por_fkey,
  add constraint captura_subida_por_fkey
  foreign key (subida_por) references auth.users(id) on delete set null;

alter table consentimiento drop constraint consentimiento_registrado_por_fkey,
  add constraint consentimiento_registrado_por_fkey
  foreign key (registrado_por) references auth.users(id) on delete set null;

alter table enlace_acceso drop constraint enlace_acceso_creado_por_fkey,
  add constraint enlace_acceso_creado_por_fkey
  foreign key (creado_por) references auth.users(id) on delete set null;

-- Un perfil de remero sin atleta no tiene acceso (accesoVigente lo rechaza).
alter table perfil drop constraint perfil_atleta_id_fkey,
  add constraint perfil_atleta_id_fkey
  foreign key (atleta_id) references atleta(id) on delete set null;

-- ---------------------------------------------------------------------------
-- (b) entrena_a también exige que quien llama SIGA siendo entrenador: degradar
-- o borrar su perfil corta el acceso al instante, aunque queden asignaciones y
-- el JWT siga vigente. Misma firma, grants, security definer y search_path.
-- ---------------------------------------------------------------------------
create or replace function entrena_a(atleta uuid) returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from perfil p
    where p.user_id = auth.uid() and p.rol = 'entrenador'
  ) and exists (
    select 1 from asignacion_entrenador a
    where a.entrenador_id = auth.uid()
      and a.atleta_id = entrena_a.atleta
      and a.desde <= hoy_santiago()
      and (a.hasta is null or a.hasta >= hoy_santiago())
  );
$$;

-- ---------------------------------------------------------------------------
-- (c) split: escribir exige lo mismo que escribir la sesión (consentimiento
-- vigente y atleta activo), evaluado sobre la sesión padre.
-- ---------------------------------------------------------------------------
drop policy split_insert on split;
drop policy split_update on split;

create policy split_insert on split for insert to authenticated
  with check (exists (
    select 1 from sesion s
    where s.id = sesion_id
      and puede_ver_atleta(s.atleta_id)
      and consentimiento_vigente(s.atleta_id)
      and (select a.activo from atleta a where a.id = s.atleta_id)
  ));
create policy split_update on split for update to authenticated
  using (exists (select 1 from sesion s where s.id = sesion_id and puede_ver_atleta(s.atleta_id)))
  with check (exists (
    select 1 from sesion s
    where s.id = sesion_id
      and puede_ver_atleta(s.atleta_id)
      and consentimiento_vigente(s.atleta_id)
      and (select a.activo from atleta a where a.id = s.atleta_id)
  ));

-- ---------------------------------------------------------------------------
-- (d) sesion.creado_por tampoco cambia en UPDATE desde el cliente (en INSERT
-- ya lo fija la política: creado_por = auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function sesion_proteger_columnas() returns trigger
language plpgsql set search_path = public, pg_catalog
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.concept2_result_id is not null or new.origen = 'api_concept2' then
      raise exception 'solo el servidor puede crear sesiones importadas de Concept2'
        using errcode = '42501';
    end if;
  else
    if new.concept2_result_id is distinct from old.concept2_result_id
       or new.origen is distinct from old.origen then
      raise exception 'concept2_result_id y origen no se pueden modificar'
        using errcode = '42501';
    end if;
    if new.creado_por is distinct from old.creado_por then
      raise exception 'creado_por no se puede modificar' using errcode = '42501';
    end if;
  end if;

  if new.captura_id is not null
     and (tg_op = 'INSERT' or new.captura_id is distinct from old.captura_id)
     and not exists (
       select 1 from captura c where c.id = new.captura_id and c.subida_por = auth.uid()
     ) then
    raise exception 'la captura no pertenece al usuario' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- (e) consentimiento es evidencia legal (Ley 21.719): desde el cliente solo se
-- puede revocar (revocado_en de NULL a una fecha), sin tocar nada más, y una
-- revocación no se deshace ni se reescribe. Al insertar, registrado_por es
-- quien llama. La RPC crear_atleta_con_consentimiento es security definer y ya
-- fija registrado_por = auth.uid(): no la afecta.
-- ---------------------------------------------------------------------------
create function consentimiento_proteger_columnas() returns trigger
language plpgsql set search_path = public, pg_catalog
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.registrado_por is distinct from auth.uid() then
      raise exception 'registrado_por debe ser el usuario que registra' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.revocado_en is not null or new.revocado_en is null
     or (to_jsonb(new) - 'revocado_en') is distinct from (to_jsonb(old) - 'revocado_en') then
    raise exception 'un consentimiento solo se puede revocar, una vez y sin cambiar otros campos'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger consentimiento_proteger_columnas
  before insert or update on consentimiento
  for each row execute function consentimiento_proteger_columnas();

-- ---------------------------------------------------------------------------
-- (f) captura.storage_path: el servidor leerá ese archivo con service role
-- (OCR), así que el cliente solo puede apuntar a su propia carpeta
-- <user_id>/<archivo> (la misma regla del bucket) y no puede cambiarlo después.
-- Se rechazan también los segmentos '..'.
-- ---------------------------------------------------------------------------
drop policy captura_insert on captura;
create policy captura_insert on captura for insert to authenticated
  with check (
    subida_por = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) <> ''
    and storage_path !~ '(^|/)\.\.(/|$)'
  );

create or replace function captura_proteger_columnas() returns trigger
language plpgsql set search_path = public, pg_catalog
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.subida_por is distinct from old.subida_por then
      raise exception 'subida_por no se puede modificar' using errcode = '42501';
    end if;
    if new.storage_path is distinct from old.storage_path then
      raise exception 'storage_path no se puede modificar' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function consentimiento_proteger_columnas() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- (g) Privilegios que los clientes nunca necesitan. RLS no cubre TRUNCATE, y
-- REFERENCES/TRIGGER no tienen uso desde PostgREST. Se mantiene
-- select/insert/update/delete (gobernados por RLS), incluidas tablas futuras.
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
