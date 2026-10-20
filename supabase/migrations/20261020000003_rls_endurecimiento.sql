-- Endurecimiento de RLS (revisión de la Task 4). La 000002 ya está aplicada:
-- todo cambio va acá.
--
-- Criterio para "cliente" en los triggers: current_user in ('authenticated','anon').
-- Es el rol con que PostgREST ejecuta las peticiones con JWT de usuario. Pasan
-- sin restricción el service_role (servidor), postgres (migraciones) y el código
-- de funciones security definer (current_user = su dueño), como la RPC de alta
-- de atletas de la Task 5. Los triggers son security invoker a propósito: si
-- fueran security definer, current_user sería siempre el dueño.

-- ---------------------------------------------------------------------------
-- I1: las asignaciones vencen según la fecha civil de Santiago, sin depender
-- de la zona horaria de la sesión (PostgREST acepta "Prefer: timezone=...").
-- ---------------------------------------------------------------------------
create function hoy_santiago() returns date
language sql stable set search_path = public, pg_catalog
as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

revoke execute on function hoy_santiago() from public, anon;
grant  execute on function hoy_santiago() to authenticated, service_role;

create or replace function entrena_a(atleta uuid) returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from asignacion_entrenador a
    where a.entrenador_id = auth.uid()
      and a.atleta_id = entrena_a.atleta
      and a.desde <= hoy_santiago()
      and (a.hasta is null or a.hasta >= hoy_santiago())
  );
$$;

alter table asignacion_entrenador alter column desde set default hoy_santiago();

-- ---------------------------------------------------------------------------
-- I2 + I4: columnas de sesion que un cliente no puede fijar.
--  - captura_id: solo una captura subida por el propio usuario (al insertar o
--    al cambiarla; si no cambia, la edición de otros campos sigue permitida).
--    Va en trigger y no en la política porque en UPDATE hay que comparar con
--    el valor anterior, y RLS no ve OLD.
--  - concept2_result_id y origen 'api_concept2': solo la importación del
--    servidor. En UPDATE, el cliente no puede cambiar ni concept2_result_id ni
--    origen.
-- No se fuerza verificado = false en inserts con origen 'ocr_foto': el diseño
-- §7 guarda la sesión de OCR al confirmar, con verificado = true.
-- ---------------------------------------------------------------------------
create function sesion_proteger_columnas() returns trigger
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

create trigger sesion_proteger_columnas
  before insert or update on sesion
  for each row execute function sesion_proteger_columnas();

-- I2: el dueño de una captura no cambia (si no, quien la ve vía una sesión
-- podría apropiársela).
create function captura_proteger_columnas() returns trigger
language plpgsql set search_path = public, pg_catalog
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.subida_por is distinct from old.subida_por then
    raise exception 'subida_por no se puede modificar' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger captura_proteger_columnas
  before update on captura
  for each row execute function captura_proteger_columnas();

-- ---------------------------------------------------------------------------
-- I3: atleta.user_id y concept2_user_id los fija solo el servidor. user_id
-- decide de qué cuenta se generan los enlaces de acceso.
-- ---------------------------------------------------------------------------
create function atleta_proteger_columnas() returns trigger
language plpgsql set search_path = public, pg_catalog
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.user_id is not null or new.concept2_user_id is not null))
     or (tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id
                               or new.concept2_user_id is distinct from old.concept2_user_id)) then
    raise exception 'user_id y concept2_user_id solo los asigna el servidor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger atleta_proteger_columnas
  before insert or update on atleta
  for each row execute function atleta_proteger_columnas();

revoke execute on function sesion_proteger_columnas()  from public, anon, authenticated;
revoke execute on function captura_proteger_columnas() from public, anon, authenticated;
revoke execute on function atleta_proteger_columnas()  from public, anon, authenticated;
