-- Registro abierto con usuario y contraseña (cuentas pendientes de vincular).
--
-- perfil.usuario: el nombre de usuario con que se entra (único, en minúsculas).
-- perfil.creado_en: para limitar cuántas cuentas nuevas entran por hora.
-- No cambia ninguna política: crear perfiles sigue siendo solo del servidor
-- (service role) o del admin, así que nadie puede darse un rol ni un atleta.

alter table perfil
  add column usuario   text,
  add column creado_en timestamptz not null default now();

create unique index idx_perfil_usuario on perfil (usuario) where usuario is not null;

-- Cuentas con contraseña que ya existen (staff): su usuario es la parte local del correo sintético.
update perfil p
   set usuario = split_part(u.email, '@', 1)
  from auth.users u
 where u.id = p.user_id
   and u.email like '%@staff.regatapp.invalid'
   and p.usuario is null;

-- ---------------------------------------------------------------------------
-- Cuentas pendientes: sin lectura (ya ocurre: no ven atletas ni sesiones) y
-- ahora tampoco ESCRITURA. Con registro abierto, un desconocido no debe poder
-- subir archivos al bucket de fotos, crear capturas, llenar el registro de
-- accesos ni leer competencias. tiene_acceso() = staff, o remero ya vinculado
-- a un atleta.
-- ---------------------------------------------------------------------------
create function tiene_acceso() returns boolean
language sql stable security definer set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from perfil p
    where p.user_id = auth.uid()
      and (p.rol in ('admin', 'entrenador') or p.atleta_id is not null)
  );
$$;

revoke execute on function tiene_acceso() from public, anon;
grant  execute on function tiene_acceso() to authenticated;

-- captura: mismas reglas de ruta de la 000005, más tiene_acceso().
drop policy captura_insert on captura;
create policy captura_insert on captura for insert to authenticated
  with check (
    tiene_acceso()
    and subida_por = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) <> ''
    and storage_path !~ '(^|/)\.\.(/|$)'
  );

-- bucket de fotos
drop policy capturas_insert_propia on storage.objects;
create policy capturas_insert_propia on storage.objects for insert to authenticated
  with check (
    bucket_id = 'capturas'
    and (storage.foldername(name))[1] = auth.uid()::text
    and tiene_acceso()
  );

-- competencias: solo para quien tiene acceso (antes: cualquier autenticado)
drop policy competencia_select on competencia;
create policy competencia_select on competencia for select to authenticated
  using (tiene_acceso());

-- registro de accesos: solo lo escribe quien tiene acceso
create or replace function registrar_acceso(p_atleta_id uuid, p_accion text, p_detalle jsonb default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'registrar_acceso requiere un usuario autenticado' using errcode = '42501';
  end if;
  if not tiene_acceso() then
    raise exception 'sin acceso' using errcode = '42501';
  end if;
  insert into registro_acceso (usuario_id, atleta_id, accion, detalle)
  values (auth.uid(), p_atleta_id, p_accion, p_detalle);
end;
$$;
