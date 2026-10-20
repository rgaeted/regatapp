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
  if (process.env.ALLOW_REMOTE_TESTS === "1" && ref && host.startsWith(ref)) return;
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

let clienteAdmin: SupabaseClient | undefined;
export function admin(): SupabaseClient {
  clienteAdmin ??= createClient(URL_SUPABASE, SERVICE_KEY, opciones);
  return clienteAdmin;
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
    })
    .select("id")
    .single();
  falla("crearSesion", error);
  const id = data!.id as string;
  sesionesCreadas.push(id);
  return id;
}

// Borra todo lo creado por los helpers. Los atletas arrastran en cascada
// sesiones, splits y consentimientos.
export async function limpiar(): Promise<void> {
  const db = admin();
  const errores: string[] = [];
  const intentar = async (nombre: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) errores.push(`${nombre}: ${error.message}`);
  };

  if (sesionesCreadas.length) await intentar("sesion", db.from("sesion").delete().in("id", sesionesCreadas));
  if (usuariosCreados.length) {
    await intentar("registro_acceso/u", db.from("registro_acceso").delete().in("usuario_id", usuariosCreados));
    await intentar("enlace_acceso", db.from("enlace_acceso").delete().in("usuario_id", usuariosCreados));
  }
  if (atletasCreados.length) {
    await intentar("registro_acceso/a", db.from("registro_acceso").delete().in("atleta_id", atletasCreados));
    await intentar("atleta", db.from("atleta").delete().in("id", atletasCreados));
  }
  for (const id of usuariosCreados) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) errores.push(`usuario ${id}: ${error.message}`);
  }
  sesionesCreadas.length = 0;
  atletasCreados.length = 0;
  usuariosCreados.length = 0;
  if (errores.length) throw new Error(`limpiar() falló: ${errores.join("; ")}`);
}
