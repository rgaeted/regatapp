import { existsSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteAdminCore } from "../lib/supabase/admin-core";

/** Termina con un mensaje en stderr. Nunca incluir valores de secretos. */
export function fallar(mensaje: string): never {
  console.error(mensaje);
  process.exit(1);
}

/** Carga ENV_FILE (por defecto .env.local) y devuelve cliente admin y URL del sitio. */
export function entorno(): { admin: SupabaseClient; siteUrl: string } {
  const archivo = process.env.ENV_FILE || ".env.local";
  if (existsSync(archivo)) process.loadEnvFile(archivo);

  const leer = (nombre: string): string => {
    const valor = process.env[nombre];
    if (!valor) fallar(`Falta la variable de entorno ${nombre} (archivo: ${archivo}).`);
    return valor;
  };
  const url = leer("NEXT_PUBLIC_SUPABASE_URL");
  const clave = leer("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = leer("NEXT_PUBLIC_SITE_URL").replace(/\/+$/, "");
  return { admin: crearClienteAdminCore(url, clave), siteUrl };
}

export function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
