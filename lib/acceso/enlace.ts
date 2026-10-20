import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enlaces de acceso de un solo uso. Reciben el cliente service role y NO
 * autorizan al llamador: asumen un contexto de servidor de confianza.
 * Sin `server-only` para que las reutilicen scripts y vitest.
 */

const VIGENCIA_MS = 24 * 60 * 60 * 1000;
// hashed_token de GoTrue: caracteres seguros; cualquier otra cosa no puede existir.
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{1,512}$/;

export type ResultadoEnlace =
  | { ok: true; nombre: string; usuarioId: string }
  | { ok: false; motivo: "inexistente" | "vencido" | "usado" | "sin_acceso" };

type Motivo = Extract<ResultadoEnlace, { ok: false }>["motivo"];

export const MENSAJES_ENLACE: Record<Motivo, string> = {
  inexistente: "Este enlace no es válido.",
  vencido: "Este enlace venció. Pídele uno nuevo a tu entrenador.",
  usado: "Este enlace ya se usó. Pídele uno nuevo a tu entrenador.",
  sin_acceso: "Tu acceso está desactivado. Habla con tu entrenador.",
};

interface PerfilAcceso {
  rol: "remero" | "entrenador" | "admin";
  nombre: string;
  atleta_id: string | null;
}

/** Devuelve el perfil si el usuario puede entrar hoy; null si no. */
async function perfilConAcceso(admin: SupabaseClient, usuarioId: string): Promise<PerfilAcceso | null> {
  const { data: perfil, error } = await admin
    .from("perfil")
    .select("rol, nombre, atleta_id")
    .eq("user_id", usuarioId)
    .maybeSingle();
  if (error) throw new Error(`perfil: ${error.message}`);
  if (!perfil) return null;
  const p = perfil as PerfilAcceso;
  if (p.rol !== "remero") return p;
  if (!p.atleta_id) return null;

  const { data: atleta, error: errA } = await admin
    .from("atleta")
    .select("activo")
    .eq("id", p.atleta_id)
    .maybeSingle();
  if (errA) throw new Error(`atleta: ${errA.message}`);
  if (!atleta || !atleta.activo) return null;

  // Misma regla que consentimiento_vigente(): existe alguno sin revocar.
  const { data: cons, error: errC } = await admin
    .from("consentimiento")
    .select("id")
    .eq("atleta_id", p.atleta_id)
    .is("revocado_en", null)
    .limit(1);
  if (errC) throw new Error(`consentimiento: ${errC.message}`);
  return cons.length > 0 ? p : null;
}

/**
 * Genera un enlace de acceso de 24 h y lo registra. No invalida enlaces
 * anteriores del mismo usuario.
 *
 * El llamador debe verificar que el usuario puede generar este enlace:
 * entrenador solo para atletas que entrena; solo admin para staff.
 */
export async function generarEnlace(
  admin: SupabaseClient,
  opts: { usuarioId: string; creadoPor: string | null; siteUrl: string },
): Promise<string> {
  const { data: u, error: errU } = await admin.auth.admin.getUserById(opts.usuarioId);
  const email = u?.user?.email;
  if (errU || !email) throw new Error(`usuario: ${errU?.message ?? "sin correo"}`);

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new Error(`generateLink: ${error?.message ?? "sin token"}`);

  const { error: errIns } = await admin.from("enlace_acceso").insert({
    usuario_id: opts.usuarioId,
    token_hash: hash,
    creado_por: opts.creadoPor,
    vence_en: new Date(Date.now() + VIGENCIA_MS).toISOString(),
  });
  if (errIns) throw new Error(`enlace_acceso: ${errIns.message}`);

  const { data: perfil } = await admin
    .from("perfil")
    .select("atleta_id")
    .eq("user_id", opts.usuarioId)
    .maybeSingle();
  const { error: errReg } = await admin.from("registro_acceso").insert({
    accion: "generar_enlace",
    atleta_id: perfil?.atleta_id ?? null,
    usuario_id: opts.creadoPor,
  });
  if (errReg) throw new Error(`registro_acceso: ${errReg.message}`);

  return `${opts.siteUrl}/entrar?t=${hash}`;
}

/** Solo lectura: nunca llama a verifyOtp, así la previsualización no consume el enlace. */
export async function resolverEnlace(admin: SupabaseClient, token: string): Promise<ResultadoEnlace> {
  if (typeof token !== "string" || !FORMATO_TOKEN.test(token)) {
    return { ok: false, motivo: "inexistente" };
  }
  const { data: fila, error } = await admin
    .from("enlace_acceso")
    .select("usuario_id, vence_en, usado_en")
    .eq("token_hash", token)
    .maybeSingle();
  if (error) throw new Error(`enlace_acceso: ${error.message}`);
  if (!fila) return { ok: false, motivo: "inexistente" };
  if (fila.usado_en) return { ok: false, motivo: "usado" };
  if (Date.parse(fila.vence_en as string) <= Date.now()) return { ok: false, motivo: "vencido" };

  const perfil = await perfilConAcceso(admin, fila.usuario_id as string);
  if (!perfil) return { ok: false, motivo: "sin_acceso" };
  return { ok: true, nombre: perfil.nombre, usuarioId: fila.usuario_id as string };
}

/**
 * Marca el enlace como usado solo si sigue sin usar (`update ... where usado_en
 * is null`); repetirlo es un no-op. La garantía real de un solo uso la da
 * Supabase al consumir el OTP en verifyOtp; esto solo refleja el estado.
 *
 * El llamador debe invocarlo únicamente tras un verifyOtp exitoso.
 */
export async function marcarUsado(admin: SupabaseClient, token: string): Promise<void> {
  const { error } = await admin
    .from("enlace_acceso")
    .update({ usado_en: new Date().toISOString() })
    .eq("token_hash", token)
    .is("usado_en", null);
  if (error) throw new Error(`enlace_acceso: ${error.message}`);
}

/** Staff: tiene perfil. Remero: atleta activo y consentimiento vigente. */
export async function accesoVigente(admin: SupabaseClient, usuarioId: string): Promise<boolean> {
  return (await perfilConAcceso(admin, usuarioId)) !== null;
}
