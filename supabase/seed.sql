-- Datos ficticios para desarrollo local (sin datos reales). Se aplica con `supabase db reset`.
-- Ids fijos para usarlos con `npm run enlace:atleta -- --atleta <id>`:
--   Atleta Uno  (nacido 2011, consentimiento de apoderado): 00000000-0000-4000-8000-0000000000a1
--   Atleta Dos  (nacido 2005, consentimiento propio):       00000000-0000-4000-8000-0000000000a2

insert into atleta (id, nombre, apellido, fecha_nacimiento, sexo)
values
  ('00000000-0000-4000-8000-0000000000a1', 'Atleta', 'Uno', '2011-03-15', 'X'),
  ('00000000-0000-4000-8000-0000000000a2', 'Atleta', 'Dos', '2005-08-20', 'X')
on conflict (id) do nothing;

insert into consentimiento (id, atleta_id, otorgado_por_nombre, relacion, medio, version_texto, otorgado_en)
values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
   'Apoderado Ficticio', 'apoderado', 'papel', 'v0-pruebas', '2026-01-01'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a2',
   'Atleta Dos', 'propio', 'papel', 'v0-pruebas', '2026-01-01')
on conflict (id) do nothing;
