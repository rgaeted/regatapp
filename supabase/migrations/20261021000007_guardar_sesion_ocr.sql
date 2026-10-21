-- Guardar una sesión leída de una foto (fase 2). Extiende guardar_sesion con un
-- tercer parámetro opcional `p_ocr` = {captura_id, verificado, editado_manual}.
--
-- Sin p_ocr todo queda igual que en la 000006 (manual, verificada).
-- Con p_ocr: origen = 'ocr_foto', captura_id enlazada y `verificado` según la
-- persona haya confirmado (true) o guardado sin revisar (false; esas sesiones
-- quedan fuera de récords y curvas). editado_manual se anota en la captura.
--
-- Una foto = una sesión: la RPC lo comprueba (RG001) y el índice único lo garantiza
-- ante dos envíos simultáneos. El bucket `capturas` pasa a aceptar solo imágenes de
-- hasta 5 MB (la app reduce la foto a ~300 KB antes de subirla).
--
-- Sigue siendo security invoker: RLS y el trigger sesion_proteger_columnas
-- exigen que la captura sea del propio usuario (subida_por = auth.uid()).
-- Cambia la firma, así que se reemplaza la función (no hay llamadas intermedias:
-- la app se despliega con esta migración).

drop function guardar_sesion(jsonb, jsonb);

create function guardar_sesion(p_sesion jsonb, p_splits jsonb, p_ocr jsonb default null)
returns uuid
language plpgsql volatile security invoker set search_path = public, pg_catalog
as $$
declare
  v_uid       uuid := auth.uid();
  v_id        uuid;
  v_prev      record;
  v_captura   uuid;
  v_verificada boolean;
  v_editado   boolean;
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
  if p_ocr is not null then
    if jsonb_typeof(p_ocr) <> 'object' or (p_ocr->>'captura_id') is null then
      raise exception 'p_ocr debe ser un objeto con captura_id' using errcode = '22023';
    end if;
    v_captura    := (p_ocr->>'captura_id')::uuid;
    -- Una foto produce a lo sumo una sesión (si no, se duplicaría un 2k verificado).
    if exists (select 1 from sesion where captura_id = v_captura) then
      raise exception 'esta foto ya se guardó como una sesión' using errcode = 'RG001';
    end if;
    v_verificada := coalesce((p_ocr->>'verificado')::boolean, false);
    v_editado    := coalesce((p_ocr->>'editado_manual')::boolean, false);
  end if;

  v_id := (p_sesion->>'id')::uuid;
  if v_id is null then
    raise exception 'la sesión requiere id' using errcode = '22023';
  end if;

  -- Idempotente por id; mismo id con otros datos es un conflicto (ver 000006).
  select atleta_id, distancia_m, tiempo_ds into v_prev
  from sesion where id = v_id and creado_por = v_uid;
  if found then
    if v_prev.atleta_id is distinct from (p_sesion->>'atleta_id')::uuid
       or v_prev.distancia_m is distinct from (p_sesion->>'distancia_m')::integer
       or v_prev.tiempo_ds is distinct from (p_sesion->>'tiempo_ds')::integer then
      raise exception 'ya existe una sesión con este id y otros datos' using errcode = '23505';
    end if;
    return v_id;
  end if;

  insert into sesion (
    id, atleta_id, tipo, modalidad, fecha, distancia_m, tiempo_ds, spm_promedio,
    fc_promedio, fc_maxima, calorias, factor_arrastre, descripcion, rpe, notas,
    origen, verificado, captura_id, creado_por
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
    case when p_ocr is null then 'manual'::origen_dato else 'ocr_foto'::origen_dato end,
    case when p_ocr is null then true else v_verificada end,
    v_captura,
    v_uid
  );

  insert into split (sesion_id, orden, distancia_m, tiempo_ds, spm, fc)
  select v_id, x.orden, x.distancia_m, x.tiempo_ds, x.spm, x.fc
  from jsonb_to_recordset(p_splits)
    as x(orden integer, distancia_m integer, tiempo_ds integer, spm numeric, fc integer);

  if exists (select 1 from split where sesion_id = v_id and tiempo_ds <= 0) then
    raise exception 'los splits deben tener tiempo positivo' using errcode = '22023';
  end if;

  if p_ocr is not null then
    update captura set editado_manual = v_editado where id = v_captura and subida_por = v_uid;
  end if;

  return v_id;
end;
$$;

create unique index idx_sesion_captura_unica on sesion (captura_id) where captura_id is not null;

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'capturas';

revoke execute on function guardar_sesion(jsonb, jsonb, jsonb) from public, anon;
grant  execute on function guardar_sesion(jsonb, jsonb, jsonb) to authenticated;
