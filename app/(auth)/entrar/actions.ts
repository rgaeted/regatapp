"use server";

import { redirect } from "next/navigation";
import { canjearEnlace, rutaFalloEntrar } from "@/lib/acceso/canjear";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function entrar(formData: FormData): Promise<void> {
  const t = formData.get("t");
  const token = typeof t === "string" ? t : "";
  const resultado = await canjearEnlace(
    { admin: crearClienteAdmin(), auth: await crearClienteServidor() },
    token,
  );
  if (resultado.ok) redirect("/");
  // Solo viaja un motivo de lista cerrada (el texto lo pone la página) y el
  // token únicamente para reintentar, validado.
  redirect(rutaFalloEntrar(resultado.motivo, token));
}
