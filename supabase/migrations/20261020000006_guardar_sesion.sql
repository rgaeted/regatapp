-- Guardar una sesión manual con sus splits en una sola transacción (fase 1).
--
-- security invoker a propósito: corren las políticas RLS y los triggers de
-- protección del usuario que llama (sesion_insert exige creado_por = auth.uid(),
-- consentimiento vigente y atleta activo). Esta función no da permisos nuevos.
--
-- Idempotente por id: el cliente genera el uuid una vez; reintentar (doble
-- toque, red lenta) devuelve el mismo id sin duplicar la sesión ni los splits.

create function guardar_sesion(p_sesion jsonb, p_splits jsonb)
returns uuid
language plpgsql volatile security invoker set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'se requiere un usuario autenticado' using errcode = '42501';
  end if;
  if p_sesion is null or jsonb_typeof(p_sesion) <> 'object' then
    raise exception 'p_sesion debe ser un objeto JSON' using errcode = '22023';
  end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' then
    raise exception 'p_splits debe ser un arreglo JSON' using errcode = '22023';
  end if;

  v_id := (p_sesion->>'id')::uuid;
  if v_id is null then
    raise exception 'la sesión requiere id' using errcode = '22023';
  end if;

  -- Reintento del mismo usuario: ya está guardada.
  if exists (select 1 from sesion where id = v_id and creado_por = v_uid) then
    return v_id;
  end if;

  insert into sesion (
    id, atleta_id, tipo, modalidad, fecha, distancia_m, tiempo_ds, spm_promedio,
    fc_promedio, fc_maxima, calorias, factor_arrastre, descripcion, rpe, notas,
    origen, verificado, creado_por
  )
  values (
    v_id,
    (p_sesion->>'atleta_id')::uuid,
    (p_sesion->>'tipo')::tipo_sesion,
    coalesce((p_sesion->>'modalidad')::modalidad, 'ergometro'),
    (p_sesion->>'fecha')::timestamptz,
    (p_sesion->>'distancia_m')::integer,
    (p_sesion->>'tiempo_ds')::integer,
    (p_sesion->>'spm_promedio')::numeric,
    (p_sesion->>'fc_promedio')::integer,
    (p_sesion->>'fc_maxima')::integer,
    (p_sesion->>'calorias')::integer,
    (p_sesion->>'factor_arrastre')::integer,
    nullif(btrim(p_sesion->>'descripcion'), ''),
    (p_sesion->>'rpe')::integer,
    nullif(btrim(p_sesion->>'notas'), ''),
    'manual',
    true,
    v_uid
  );

  insert into split (sesion_id, orden, distancia_m, tiempo_ds, spm, fc)
  select v_id, x.orden, x.distancia_m, x.tiempo_ds, x.spm, x.fc
  from jsonb_to_recordset(p_splits)
    as x(orden integer, distancia_m integer, tiempo_ds integer, spm numeric, fc integer);

  -- La tabla split solo exige tiempo_ds not null; un split de 0 o negativo no
  -- tiene sentido y revierte toda la sesión.
  if exists (select 1 from split where sesion_id = v_id and tiempo_ds <= 0) then
    raise exception 'los splits deben tener tiempo positivo' using errcode = '22023';
  end if;

  return v_id;
end;
$$;

revoke execute on function guardar_sesion(jsonb, jsonb) from public, anon;
grant  execute on function guardar_sesion(jsonb, jsonb) to authenticated;
