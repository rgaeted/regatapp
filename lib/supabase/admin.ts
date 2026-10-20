import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { envPublico } from "@/lib/env";
import { crearClienteAdminCore } from "@/lib/supabase/admin-core";

export function envServidor(): { SUPABASE_SERVICE_ROLE_KEY: string } {
  const r = z
    .object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) })
    .safeParse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  if (!r.success) {
    throw new Error(
      "Variable de entorno de servidor faltante: SUPABASE_SERVICE_ROLE_KEY. Revisa .env.local.",
    );
  }
  return r.data;
}

export function crearClienteAdmin(): SupabaseClient {
  return crearClienteAdminCore(
    envPublico.NEXT_PUBLIC_SUPABASE_URL,
    envServidor().SUPABASE_SERVICE_ROLE_KEY,
  );
}
