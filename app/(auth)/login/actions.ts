"use server";

import { redirect } from "next/navigation";
import { iniciarConClave } from "@/lib/acceso/clave";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { error?: string; usuario?: string };

export async function iniciarSesionAccion(_previo: EstadoLogin, fd: FormData): Promise<EstadoLogin> {
  const usuario = String(fd.get("usuario") ?? "");
  const clave = String(fd.get("clave") ?? "");
  const r = await iniciarConClave(await crearClienteServidor(), crearClienteAdmin(), usuario, clave);
  // Se devuelve el usuario (nunca la clave) para no obligar a reescribirlo tras un error.
  if (!r.ok) return { error: r.error, usuario };
  redirect("/");
}
