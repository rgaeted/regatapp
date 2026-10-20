import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Carga .env.local si faltan variables (en CI vienen del entorno).
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

function requerir(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

const URL_SUPABASE = requerir("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = requerir("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY = requerir("SUPABASE_SERVICE_ROLE_KEY");

// Guardia de seguridad: los tests escriben y borran datos. Solo corren contra
// Supabase local, o contra el proyecto dev explícitamente autorizado.
export function verificarEntornoDeTest(): void {
  const host = new URL(URL_SUPABASE).hostname;
  if (host === "localhost" || host === "127.0.0.1") return;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (process.env.ALLOW_REMOTE_TESTS === "1" && ref && host === `${ref}.supabase.co`) return;
  throw new Error(
    `Los tests de integración no pueden correr contra ${host}. ` +
      "Usa Supabase local o define ALLOW_REMOTE_TESTS=1 y SUPABASE_PROJECT_REF del proyecto dev.",
  );
}
verificarEntornoDeTest();

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

const usuariosCreados: string[] = [];
const atletasCreados: string[] = [];
const sesionesCreadas: string[] = [];

// Para que limpiar() borre usuarios creados fuera de los helpers (p. ej. por lib/acceso).
export function registrarUsuario(id: string): void {
  if (!usuariosCreados.includes(id)) usuariosCreados.push(id);
}

let clienteAdmin: SupabaseClient | undefined;
export function admin(): SupabaseClient {
  clienteAdmin ??= createClient(URL_SUPABASE, SERVICE_KEY, opciones);
  return clienteAdmin;
}

// Cliente sin sesión (rol anon de PostgREST).
export function clienteAnonimo(): SupabaseClient {
  return createClient(URL_SUPABASE, ANON_KEY, opciones);
}

export const BUCKET_CAPTURAS = "capturas";

// GET crudo a PostgREST con el JWT del usuario, para mandar cabeceras que
// supabase-js no expone (p. ej. Prefer: timezone=...).
export async function consultaRest(
  cliente: SupabaseClient,
  ruta: string,
  cabeceras: Record<string, string> = {},
): Promise<{ status: number; body: unknown; preferenciaAplicada: string | null }> {
  const { data } = await cliente.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("consultaRest: el cliente no tiene sesión");
  const r = await fetch(`${URL_SUPABASE}/rest/v1/${ruta}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, ...cabeceras },
  });
  return { status: r.status, body: await r.json(), preferenciaAplicada: r.headers.get("preference-applied") };
}

function falla(contexto: string, error: { message: string } | null): void {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

export async function crearUsuario(opts: {
  rol: "remero" | "entrenador" | "admin";
  atletaId?: string;
  nombre?: string;
}): Promise<{ id: string; cliente: SupabaseClient }> {
  const email = `t-${randomUUID()}@test.invalid`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  falla("crearUsuario", error);
  const id = data.user!.id;
  usuariosCreados.push(id);

  const { error: errPerfil } = await admin()
    .from("perfil")
    .insert({ user_id: id, rol: opts.rol, atleta_id: opts.atletaId ?? null, nombre: opts.nombre ?? "" });
  falla("crearUsuario/perfil", errPerfil);

  const cliente = createClient(URL_SUPABASE, ANON_KEY, opciones);
  const { error: errLogin } = await cliente.auth.signInWithPassword({ email, password });
  falla("crearUsuario/login", errLogin);
  return { id, cliente };
}

export async function crearAtleta(
  opts: { activo?: boolean; consentimiento?: boolean; fechaNacimiento?: string } = {},
): Promise<string> {
  const { data, error } = await admin()
    .from("atleta")
    .insert({
      nombre: "Test",
      apellido: `A-${randomUUID().slice(0, 8)}`,
      activo: opts.activo ?? true,
      fecha_nacimiento: opts.fechaNacimiento ?? null,
    })
    .select("id")
    .single();
  falla("crearAtleta", error);
  const id = data!.id as string;
  atletasCreados.push(id);

  if (opts.consentimiento ?? true) {
    const { error: errCons } = await admin().from("consentimiento").insert({
      atleta_id: id,
      otorgado_por_nombre: "Apoderado Test",
      relacion: opts.fechaNacimiento ? "apoderado" : "propio",
      medio: "papel",
      version_texto: "v1",
      otorgado_en: "2026-01-01",
    });
    falla("crearAtleta/consentimiento", errCons);
  }
  return id;
}

export async function asignar(
  entrenadorId: string,
  atletaId: string,
  desde?: string,
  hasta?: string | null,
): Promise<void> {
  const fila: Record<string, unknown> = { entrenador_id: entrenadorId, atleta_id: atletaId };
  if (desde) fila.desde = desde;
  if (hasta !== undefined) fila.hasta = hasta;
  const { error } = await admin().from("asignacion_entrenador").insert(fila);
  falla("asignar", error);
}

export async function crearSesion(
  atletaId: string,
  campos: Partial<{
    tipo: "entrenamiento" | "test" | "competencia";
    distancia_m: number | null;
    tiempo_ds: number | null;
    creado_por: string;
  }> = {},
): Promise<string> {
  const { data, error } = await admin()
    .from("sesion")
    .insert({
      atleta_id: atletaId,
      tipo: campos.tipo ?? "test",
      fecha: new Date().toISOString(),
      distancia_m: "distancia_m" in campos ? campos.distancia_m : 2000,
      tiempo_ds: "tiempo_ds" in campos ? campos.tiempo_ds : 4200,
      creado_por: campos.creado_por ?? null,
    })
    .select("id")
    .single();
  falla("crearSesion", error);
  const id = data!.id as string;
  sesionesCreadas.push(id);
  return id;
}

// Borra todo lo creado por los helpers, en orden seguro: primero las filas que
// dependen de usuarios/atletas (varias FK a auth.users y atleta no tienen ON
// DELETE), luego atletas y al final los usuarios. Sigue ante errores y lanza al final.
export async function limpiar(): Promise<void> {
  const db = admin();
  const errores: string[] = [];
  const intentar = async (nombre: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) errores.push(`${nombre}: ${error.message}`);
  };
  const u = [...usuariosCreados];
  const a = [...atletasCreados];
  const s = [...sesionesCreadas];

  if (s.length) await intentar("sesion/id", db.from("sesion").delete().in("id", s));
  if (u.length) await intentar("sesion/creado_por", db.from("sesion").delete().in("creado_por", u));
  if (a.length) await intentar("sesion/atleta", db.from("sesion").delete().in("atleta_id", a));
  if (u.length) await intentar("captura", db.from("captura").delete().in("subida_por", u));
  if (a.length) await intentar("consentimiento/atleta", db.from("consentimiento").delete().in("atleta_id", a));
  if (u.length) await intentar("consentimiento/registrado_por", db.from("consentimiento").delete().in("registrado_por", u));
  if (u.length) await intentar("asignacion/entrenador", db.from("asignacion_entrenador").delete().in("entrenador_id", u));
  if (a.length) await intentar("asignacion/atleta", db.from("asignacion_entrenador").delete().in("atleta_id", a));
  if (u.length) await intentar("perfil/user", db.from("perfil").delete().in("user_id", u));
  if (a.length) await intentar("perfil/atleta", db.from("perfil").delete().in("atleta_id", a));
  if (u.length) {
    await intentar("enlace/usuario", db.from("enlace_acceso").delete().in("usuario_id", u));
    await intentar("enlace/creado_por", db.from("enlace_acceso").delete().in("creado_por", u));
    await intentar("registro/usuario", db.from("registro_acceso").delete().in("usuario_id", u));
  }
  if (a.length) {
    await intentar("registro/atleta", db.from("registro_acceso").delete().in("atleta_id", a));
    await intentar("atleta", db.from("atleta").delete().in("id", a));
  }
  // Objetos de Storage: cada usuario sube solo a su carpeta <user_id>/ en capturas.
  for (const id of u) {
    const { data: objetos, error } = await db.storage.from(BUCKET_CAPTURAS).list(id, { limit: 1000 });
    if (error) {
      // Antes de la migración de RLS el bucket no existe: no hay nada que borrar.
      if (!/^(bucket|object) not found$/i.test(error.message)) errores.push(`storage/list ${id}: ${error.message}`);
      continue;
    }
    if (objetos?.length) {
      const rutas = objetos.map((o) => `${id}/${o.name}`);
      const { error: errRm } = await db.storage.from(BUCKET_CAPTURAS).remove(rutas);
      if (errRm) errores.push(`storage/remove ${id}: ${errRm.message}`);
    }
  }
  for (const id of u) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) errores.push(`usuario ${id}: ${error.message}`);
  }
  sesionesCreadas.length = 0;
  atletasCreados.length = 0;
  usuariosCreados.length = 0;
  if (errores.length) throw new Error(`limpiar() falló: ${errores.join("; ")}`);
}
