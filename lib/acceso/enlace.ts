import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Enlaces de acceso de un solo uso. Reciben el cliente service role y NO
 * autorizan al llamador: asumen un contexto de servidor de confianza.
 * Sin `server-only` para que las reutilicen scripts y vitest.
 */

const VIGENCIA_MS = 24 * 60 * 60 * 1000;
// hashed_token de GoTrue: caracteres seguros; cualquier otra cosa no puede existir.
export const FORMATO_TOKEN = /^[A-Za-z0-9_-]{1,512}$/;

export type ResultadoEnlace =
  | { ok: true; nombre: string; usuarioId: string }
  | { ok: false; motivo: "inexistente" | "vencido" | "usado" | "sin_acceso" | "reintentar" };

type Motivo = Extract<ResultadoEnlace, { ok: false }>["motivo"];

export const MENSAJES_ENLACE: Record<Motivo, string> = {
  inexistente: "Este enlace no es válido.",
  vencido: "Este enlace venció. Pídele uno nuevo a tu entrenador.",
  usado: "Este enlace ya se usó. Pídele uno nuevo a tu entrenador.",
  sin_acceso: "Tu acceso está desactivado. Habla con tu entrenador.",
  reintentar: "No pudimos entrar ahora. Intenta de nuevo en unos minutos.",
};

/** Perfil de quien puede entrar hoy. */
export type PerfilAcceso = z.infer<typeof PerfilAcceso>;
const PerfilAcceso = z.object({
  rol: z.enum(["remero", "entrenador", "admin"]),
  nombre: z.string(),
  atleta_id: z.string().nullable(),
});
// Fila de perfil con el atleta embebido (FK perfil.atleta_id, a lo más uno).
const FilaPerfil = PerfilAcceso.extend({
  atleta: z.object({ activo: z.boolean() }).nullable(),
});

/**
 * LA regla de acceso, en un solo lugar (enlaces, canje y la puerta de cada
 * petición): staff con perfil; remero con atleta activo y consentimiento
 * vigente. Devuelve el perfil si el usuario puede entrar hoy, null si no.
 * Dos consultas: perfil + atleta embebido, y consentimiento.
 */
export async function perfilConAcceso(admin: SupabaseClient, usuarioId: string): Promise<PerfilAcceso | null> {
  const { data, error } = await admin
    .from("perfil")
    .select("rol, nombre, atleta_id, atleta(activo)")
    .eq("user_id", usuarioId)
    .maybeSingle();
  if (error) throw new Error(`perfil: ${error.message}`);
  if (!data) return null;
  const { atleta, ...perfil } = FilaPerfil.parse(data);
  if (perfil.rol !== "remero") return perfil;
  if (!perfil.atleta_id || !atleta?.activo) return null;

  // Misma regla que consentimiento_vigente(): existe alguno sin revocar.
  const { data: cons, error: errC } = await admin
    .from("consentimiento")
    .select("id")
    .eq("atleta_id", perfil.atleta_id)
    .is("revocado_en", null)
    .limit(1);
  if (errC) throw new Error(`consentimiento: ${errC.message}`);
  return cons.length > 0 ? perfil : null;
}

/**
 * Genera un enlace de acceso de 24 h y lo registra. Rechaza (sin llamar a
 * generateLink) si `accesoVigente` es false. GoTrue guarda un solo OTP por
 * usuario y tipo: generar uno nuevo mata el anterior, así que los enlaces
 * previos sin usar se marcan como reemplazados (`usado_en`, motivo `usado`).
 *
 * El llamador debe verificar que el usuario puede generar este enlace:
 * entrenador solo para atletas que entrena; solo admin para staff.
 */
export async function generarEnlace(
  admin: SupabaseClient,
  opts: { usuarioId: string; creadoPor: string | null; siteUrl: string },
): Promise<string> {
  // perfilConAcceso lanza si falla la lectura: nunca se registra con datos a medias.
  const perfil = await perfilConAcceso(admin, opts.usuarioId);
  if (!perfil) {
    throw new Error("El usuario no tiene acceso vigente (sin perfil, atleta inactivo o consentimiento revocado)");
  }
  const { data: u, error: errU } = await admin.auth.admin.getUserById(opts.usuarioId);
  const email = u?.user?.email;
  if (errU || !email) throw new Error(`usuario: ${errU?.message ?? "sin correo"}`);

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new Error(`generateLink: ${error?.message ?? "sin token"}`);

  // El OTP anterior ya no sirve en GoTrue: reflejarlo para que la página no lo ofrezca.
  const { error: errSup } = await admin
    .from("enlace_acceso")
    .update({ usado_en: new Date().toISOString() })
    .eq("usuario_id", opts.usuarioId)
    .is("usado_en", null);
  if (errSup) throw new Error(`enlace_acceso: ${errSup.message}`);

  const { error: errIns } = await admin.from("enlace_acceso").insert({
    usuario_id: opts.usuarioId,
    token_hash: hash,
    creado_por: opts.creadoPor,
    vence_en: new Date(Date.now() + VIGENCIA_MS).toISOString(),
  });
  if (errIns) throw new Error(`enlace_acceso: ${errIns.message}`);

  // usuario_id es quien generó el enlace (null desde scripts); el sujeto va en detalle.
  const { error: errReg } = await admin.from("registro_acceso").insert({
    accion: "generar_enlace",
    atleta_id: perfil.atleta_id,
    usuario_id: opts.creadoPor,
    detalle: { usuario_objetivo: opts.usuarioId, origen: opts.creadoPor ? "app" : "script" },
  });
  if (errReg) throw new Error(`registro_acceso: ${errReg.message}`);

  return `${opts.siteUrl}/entrar?t=${hash}`;
}

/**
 * Solo lectura: nunca llama a verifyOtp, así la previsualización no consume el enlace.
 *
 * Los chequeos vencido/usado/sin_acceso son solo una puerta de UX, NO autorización:
 * el hashed_token es una credencial al portador que se puede enviar directo a
 * GoTrue. Quien llame (la acción `entrar` de la Task 8, el layout de (app)) DEBE
 * volver a comprobar `accesoVigente` tras verifyOtp y en cada petición. Además,
 * desactivar al atleta o revocar el consentimiento no mata por sí solo un OTP
 * ya emitido (pendiente para el flujo de revocación de la fase 1).
 */
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
 * Es solo contable, no una barrera: el token sigue siendo canjeable en GoTrue
 * mientras no haya vencido o se haya consumido. Quien llame DEBE re-comprobar
 * `accesoVigente` tras verifyOtp y en cada petición. Invocarlo solo tras un
 * verifyOtp exitoso.
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
