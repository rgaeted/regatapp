import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Fábrica pura del cliente admin (service role). Sin `server-only` ni lectura
 * de process.env, para usarla desde scripts (tsx) y tests (vitest) con
 * argumentos explícitos. Nunca importar desde código de navegador.
 */
export function crearClienteAdminCore(
  url: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
