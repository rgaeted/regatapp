import { AuthUnknownError, isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * ¿El error de GoTrue es transitorio (vale la pena reintentar) y NO dice nada
 * sobre la sesión o el token? Clasificación según auth-js (lib/fetch.ts):
 *
 * - `AuthRetryableFetchError`: fetch falló (red, timeout, abortado; status 0) o
 *   el servidor respondió 500–504 / 520–530 (gateway o Cloudflare). Transitorio.
 * - `AuthApiError` con status 429 (rate limit) o >= 500: transitorio.
 * - `AuthUnknownError`: la respuesta no era JSON (página de error de un proxy).
 *   No sabemos qué pasó: se trata como transitorio.
 * - Todo lo demás es definitivo: `AuthSessionMissingError` (sin cookie, o
 *   session_not_found), `AuthApiError` 4xx (JWT inválido, usuario borrado, OTP
 *   vencido o ya usado: código otp_expired, 403/401/400), etc.
 *
 * Ante la duda se elige "transitorio": nunca cuesta datos ni deja entrar a
 * nadie, solo muestra "intenta de nuevo".
 */
export function esErrorTransitorio(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (isAuthApiError(error)) return error.status === 429 || error.status >= 500;
  return error instanceof AuthUnknownError;
}
