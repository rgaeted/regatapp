-- Alta de atleta con consentimiento (diseño §2 y §5.2).
-- Única vía para crear atletas: no hay política de insert en atleta.
--
-- security definer: current_user pasa a ser el dueño de la función, así que los
-- triggers de endurecimiento (que solo restringen a authenticated/anon) NO
-- protegen esta ruta. Por eso las columnas se copian desde listas blancas
-- explícitas y registrado_por sale siempre de auth.uid(). Las llaves
-- desconocidas del JSON (user_id, concept2_user_id, activo, id, ...) se ignoran.
--
-- Es una sola sentencia/transacción: si cualquier paso falla (relación inválida,
-- consentimiento incompleto, cast incorrecto), no queda ningún atleta.

create function crear_atleta_con_consentimiento(p_atleta jsonb, p_consentimiento jsonb)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_catalog
as $$
declare
  v_uid       uuid := auth.uid();
  v_hoy       date := hoy_santiago();
  v_nacimiento date;
  v_relacion  text;
  v_otorgado  date;
  v_id        uuid;
begin
  if v_uid is null then
    raise exception 'sin permiso: se requiere un usuario autenticado' using errcode = '42501';
  end if;
  if not (es_admin() or es_entrenador()) then
    raise exception 'sin permiso' using errcode = '42501';
  end if;

  if p_atleta is null or jsonb_typeof(p_atleta) <> 'object'
     or p_consentimiento is null or jsonb_typeof(p_consentimiento) <> 'object' then
    raise exception 'p_atleta y p_consentimiento deben ser objetos JSON' using errcode = '22023';
  end if;

  if btrim(coalesce(p_atleta->>'nombre', '')) = '' or btrim(coalesce(p_atleta->>'apellido', '')) = '' then
    raise exception 'nombre y apellido son obligatorios' using errcode = '22023';
  end if;
  if btrim(coalesce(p_consentimiento->>'otorgado_por_nombre', '')) = ''
     or btrim(coalesce(p_consentimiento->>'version_texto', '')) = '' then
    raise exception 'el consentimiento requiere otorgado_por_nombre y version_texto' using errcode = '22023';
  end if;

  v_nacimiento := (p_atleta->>'fecha_nacimiento')::date;
  v_relacion   := p_consentimiento->>'relacion';
  v_otorgado   := (p_consentimiento->>'otorgado_en')::date;

  if v_otorgado is null or v_otorgado > v_hoy then
    raise exception 'otorgado_en es obligatorio y no puede ser futuro' using errcode = '22023';
  end if;

  -- Menores (o sin fecha de nacimiento): solo apoderado o tutor_legal.
  -- Edad según la fecha civil de Santiago, no la de la sesión.
  if v_relacion = 'propio'
     and (v_nacimiento is null or age(v_hoy, v_nacimiento) < interval '18 years') then
    raise exception 'la relacion propio solo es valida para mayores de 18 anos con fecha de nacimiento'
      using errcode = '22023';
  end if;

  insert into atleta (nombre, apellido, fecha_nacimiento, sexo, peso_kg, altura_cm, categoria_peso)
  values (
    btrim(p_atleta->>'nombre'),
    btrim(p_atleta->>'apellido'),
    v_nacimiento,
    p_atleta->>'sexo',
    (p_atleta->>'peso_kg')::numeric,
    (p_atleta->>'altura_cm')::integer,
    (p_atleta->>'categoria_peso')::categoria_peso
  )
  returning id into v_id;

  insert into consentimiento (
    atleta_id, otorgado_por_nombre, otorgado_por_rut, relacion, medio,
    version_texto, otorgado_en, registrado_por
  )
  values (
    v_id,
    btrim(p_consentimiento->>'otorgado_por_nombre'),
    nullif(btrim(p_consentimiento->>'otorgado_por_rut'), ''),
    v_relacion,
    p_consentimiento->>'medio',
    btrim(p_consentimiento->>'version_texto'),
    v_otorgado,
    v_uid
  );

  -- El entrenador queda asignado (desde = hoy de Santiago por defecto). El admin no.
  if es_entrenador() then
    insert into asignacion_entrenador (entrenador_id, atleta_id) values (v_uid, v_id);
  end if;

  return v_id;
end;
$$;

revoke execute on function crear_atleta_con_consentimiento(jsonb, jsonb) from public, anon;
grant  execute on function crear_atleta_con_consentimiento(jsonb, jsonb) to authenticated;
