-- Políticas RLS, funciones de acceso y bucket de capturas
-- (docs/superpowers/specs/2026-10-20-regatapp-design.md §5.2, §5.3, §5.5 y §6)
--
-- Todas las políticas son "to authenticated": anon no tiene ninguna, así que
-- con RLS activa no ve ni escribe nada.

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- security definer: leen perfil/asignacion/consentimiento sin pasar por RLS
-- (evita recursión de políticas). search_path fijo contra secuestro de objetos.
-- ---------------------------------------------------------------------------

create function es_admin() returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (select 1 from perfil where user_id = auth.uid() and rol = 'admin');
$$;

create function es_entrenador() returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (select 1 from perfil where user_id = auth.uid() and rol = 'entrenador');
$$;

create function mi_atleta_id() returns uuid
language sql stable security definer set search_path = public, pg_catalog
as $$
  select atleta_id from perfil where user_id = auth.uid();
$$;

create function entrena_a(atleta uuid) returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from asignacion_entrenador a
    where a.entrenador_id = auth.uid()
      and a.atleta_id = entrena_a.atleta
      and a.desde <= current_date
      and (a.hasta is null or a.hasta >= current_date)
  );
$$;

create function puede_ver_atleta(atleta uuid) returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select es_admin() or puede_ver_atleta.atleta = mi_atleta_id() or entrena_a(puede_ver_atleta.atleta);
$$;

create function consentimiento_vigente(atleta uuid) returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from consentimiento c
    where c.atleta_id = consentimiento_vigente.atleta and c.revocado_en is null
  );
$$;

-- Diseño §5.2: única vía de escritura de registro_acceso. Toma el usuario de
-- auth.uid(); el llamador no puede suplantar a otro.
create function registrar_acceso(p_atleta_id uuid, p_accion text, p_detalle jsonb default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'registrar_acceso requiere un usuario autenticado' using errcode = '42501';
  end if;
  insert into registro_acceso (usuario_id, atleta_id, accion, detalle)
  values (auth.uid(), p_atleta_id, p_accion, p_detalle);
end;
$$;

-- Supabase concede execute a public/anon por defecto: solo authenticated.
revoke execute on function es_admin()                                from public, anon;
revoke execute on function es_entrenador()                           from public, anon;
revoke execute on function mi_atleta_id()                            from public, anon;
revoke execute on function entrena_a(uuid)                           from public, anon;
revoke execute on function puede_ver_atleta(uuid)                    from public, anon;
revoke execute on function consentimiento_vigente(uuid)              from public, anon;
revoke execute on function registrar_acceso(uuid, text, jsonb)       from public, anon;
grant  execute on function es_admin()                                to authenticated;
grant  execute on function es_entrenador()                           to authenticated;
grant  execute on function mi_atleta_id()                            to authenticated;
grant  execute on function entrena_a(uuid)                           to authenticated;
grant  execute on function puede_ver_atleta(uuid)                    to authenticated;
grant  execute on function consentimiento_vigente(uuid)              to authenticated;
grant  execute on function registrar_acceso(uuid, text, jsonb)       to authenticated;

-- ---------------------------------------------------------------------------
-- perfil: el propio; admin todos; entrenador los de sus atletas. Escribe admin.
-- ---------------------------------------------------------------------------
create policy perfil_select on perfil for select to authenticated
  using (user_id = auth.uid() or es_admin() or entrena_a(atleta_id));
create policy perfil_insert on perfil for insert to authenticated
  with check (es_admin());
create policy perfil_update on perfil for update to authenticated
  using (es_admin()) with check (es_admin());
create policy perfil_delete on perfil for delete to authenticated
  using (es_admin());

-- ---------------------------------------------------------------------------
-- atleta: sin política de insert. Se crea solo vía crear_atleta_con_consentimiento
-- (Task 5), que exige entrenador o admin y registra el consentimiento.
-- ---------------------------------------------------------------------------
create policy atleta_select on atleta for select to authenticated
  using (puede_ver_atleta(id));
create policy atleta_update on atleta for update to authenticated
  using (es_admin() or entrena_a(id)) with check (es_admin() or entrena_a(id));
create policy atleta_delete on atleta for delete to authenticated
  using (es_admin());

-- ---------------------------------------------------------------------------
-- asignacion_entrenador: admin todo; el entrenador ve las suyas.
-- ---------------------------------------------------------------------------
create policy asignacion_select on asignacion_entrenador for select to authenticated
  using (es_admin() or entrenador_id = auth.uid());
create policy asignacion_insert on asignacion_entrenador for insert to authenticated
  with check (es_admin());
create policy asignacion_update on asignacion_entrenador for update to authenticated
  using (es_admin()) with check (es_admin());
create policy asignacion_delete on asignacion_entrenador for delete to authenticated
  using (es_admin());

-- ---------------------------------------------------------------------------
-- sesion
-- ---------------------------------------------------------------------------
create policy sesion_select on sesion for select to authenticated
  using (puede_ver_atleta(atleta_id));
create policy sesion_insert on sesion for insert to authenticated
  with check (
    puede_ver_atleta(atleta_id)
    and creado_por = auth.uid()
    and consentimiento_vigente(atleta_id)
    and (select a.activo from atleta a where a.id = atleta_id)
  );
create policy sesion_update on sesion for update to authenticated
  using (puede_ver_atleta(atleta_id))
  with check (
    puede_ver_atleta(atleta_id)
    and consentimiento_vigente(atleta_id)
    and (select a.activo from atleta a where a.id = atleta_id)
  );
create policy sesion_delete on sesion for delete to authenticated
  using (puede_ver_atleta(atleta_id));

-- ---------------------------------------------------------------------------
-- split: todo vía la sesión
-- ---------------------------------------------------------------------------
create policy split_select on split for select to authenticated
  using (exists (select 1 from sesion s where s.id = sesion_id and puede_ver_atleta(s.atleta_id)));
create policy split_insert on split for insert to authenticated
  with check (exists (select 1 from sesion s where s.id = sesion_id and puede_ver_atleta(s.atleta_id)));
create policy split_update on split for update to authenticated
  using (exists (select 1 from sesion s where s.id = sesion_id and puede_ver_atleta(s.atleta_id)))
  with check (exists (select 1 from sesion s where s.id = sesion_id and puede_ver_atleta(s.atleta_id)));
create policy split_delete on split for delete to authenticated
  using (exists (select 1 from sesion s where s.id = sesion_id and puede_ver_atleta(s.atleta_id)));

-- ---------------------------------------------------------------------------
-- captura: quien la subió, admin, o quien ve una sesión que la referencia.
-- Sin delete: el borrado (retención §5.4) lo hace el servidor con service role.
-- ---------------------------------------------------------------------------
create policy captura_select on captura for select to authenticated
  using (
    subida_por = auth.uid() or es_admin()
    or exists (select 1 from sesion s where s.captura_id = captura.id and puede_ver_atleta(s.atleta_id))
  );
create policy captura_insert on captura for insert to authenticated
  with check (subida_por = auth.uid());
create policy captura_update on captura for update to authenticated
  using (
    subida_por = auth.uid() or es_admin()
    or exists (select 1 from sesion s where s.captura_id = captura.id and puede_ver_atleta(s.atleta_id))
  )
  with check (
    subida_por = auth.uid() or es_admin()
    or exists (select 1 from sesion s where s.captura_id = captura.id and puede_ver_atleta(s.atleta_id))
  );

-- ---------------------------------------------------------------------------
-- competencia: la leen todos los autenticados; escriben entrenador o admin.
-- ---------------------------------------------------------------------------
create policy competencia_select on competencia for select to authenticated
  using (true);
create policy competencia_insert on competencia for insert to authenticated
  with check (es_admin() or es_entrenador());
create policy competencia_update on competencia for update to authenticated
  using (es_admin() or es_entrenador()) with check (es_admin() or es_entrenador());
create policy competencia_delete on competencia for delete to authenticated
  using (es_admin() or es_entrenador());

-- ---------------------------------------------------------------------------
-- consentimiento: entrenador del atleta o admin; el propio remero no [decisión].
-- Sin delete: la revocación se registra con revocado_en, no borrando.
-- ---------------------------------------------------------------------------
create policy consentimiento_select on consentimiento for select to authenticated
  using (es_admin() or entrena_a(atleta_id));
create policy consentimiento_insert on consentimiento for insert to authenticated
  with check (es_admin() or entrena_a(atleta_id));
create policy consentimiento_update on consentimiento for update to authenticated
  using (es_admin() or entrena_a(atleta_id)) with check (es_admin() or entrena_a(atleta_id));

-- ---------------------------------------------------------------------------
-- registro_acceso: solo inserción vía registrar_acceso(); solo el admin lee.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on registro_acceso from anon, authenticated;
create policy registro_acceso_select on registro_acceso for select to authenticated
  using (es_admin());

-- ---------------------------------------------------------------------------
-- enlace_acceso: solo service role.
-- ---------------------------------------------------------------------------
revoke all on enlace_acceso from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage (§5.5): bucket privado, ruta <user_id>/<captura_id>.<ext>.
-- Cada usuario sube y lee solo en su carpeta; el servidor lee con service role.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('capturas', 'capturas', false);

create policy capturas_insert_propia on storage.objects for insert to authenticated
  with check (bucket_id = 'capturas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy capturas_select_propia on storage.objects for select to authenticated
  using (bucket_id = 'capturas' and (storage.foldername(name))[1] = auth.uid()::text);
