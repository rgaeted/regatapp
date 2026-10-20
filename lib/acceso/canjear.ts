import type { SupabaseClient } from "@supabase/supabase-js";
import {
  accesoVigente,
  FORMATO_TOKEN,
  marcarUsado,
  resolverEnlace,
  type ResultadoEnlace,
} from "@/lib/acceso/enlace";
import { esErrorTransitorio } from "@/lib/acceso/errores-auth";

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
  if (error || !data.user) {
    // Rate limit (429), 5xx o red: GoTrue no consumió el token, el enlace sigue
    // valiendo y no se marca. Ver la clasificación en errores-auth.ts.
    if (error && esErrorTransitorio(error)) return { ok: false, motivo: "reintentar" };
    // Definitivo (OTP inválido, vencido o ya consumido). No se filtra el texto.
    return { ok: false, motivo: "usado" };
  }

  // Defensa en profundidad: la sesión debe ser del dueño del enlace.
  if (data.user.id !== previo.usuarioId) {
    await auth.auth.signOut({ scope: "local" });
    return { ok: false, motivo: "inexistente" };
  }

  // El hashed_token es una credencial al portador que también sirve directo
  // contra GoTrue: el acceso se vuelve a comprobar tras crear la sesión.
  if (!(await accesoVigente(admin, data.user.id))) {
    await auth.auth.signOut();
    return { ok: false, motivo: "sin_acceso" };
  }

  await marcarUsado(admin, token);
  return { ok: true };
}

/**
 * A dónde vuelve /entrar tras un canje fallido. El token solo viaja de vuelta
 * para "reintentar" (sigue siendo válido) y solo si tiene el formato de un
 * hashed_token: nunca se refleja un valor sin validar.
 */
export function rutaFalloEntrar(motivo: MotivoFallo, token: string): string {
  const q = new URLSearchParams({ e: motivo });
  if (motivo === "reintentar" && FORMATO_TOKEN.test(token)) q.set("t", token);
  return `/entrar?${q.toString()}`;
}
