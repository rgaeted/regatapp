import type { SupabaseClient } from "@supabase/supabase-js";
import { accesoVigente, marcarUsado, resolverEnlace, type ResultadoEnlace } from "@/lib/acceso/enlace";

/**
 * Canje de un enlace de acceso. Sin `server-only` ni imports de Next para que
 * lo ejerciten los tests. `admin` es service role; `auth` es el cliente que
 * recibirá la sesión (en la app, el cliente ligado a cookies).
 */
export type MotivoFallo = Extract<ResultadoEnlace, { ok: false }>["motivo"];
export type ResultadoCanje = { ok: true } | { ok: false; motivo: MotivoFallo };

export async function canjearEnlace(
  deps: { admin: SupabaseClient; auth: SupabaseClient },
  token: string,
): Promise<ResultadoCanje> {
  const { admin, auth } = deps;
  const previo = await resolverEnlace(admin, token);
  if (!previo.ok) return { ok: false, motivo: previo.motivo };

  const { data, error } = await auth.auth.verifyOtp({ type: "magiclink", token_hash: token });
  // GoTrue ya lo consumió o venció. No se filtra el texto del error.
  if (error || !data.user) return { ok: false, motivo: "usado" };

  // El hashed_token es una credencial al portador que también sirve directo
  // contra GoTrue: el acceso se vuelve a comprobar tras crear la sesión.
  if (!(await accesoVigente(admin, data.user.id))) {
    await auth.auth.signOut();
    return { ok: false, motivo: "sin_acceso" };
  }

  await marcarUsado(admin, token);
  return { ok: true };
}
