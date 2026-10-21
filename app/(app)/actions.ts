"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  // Solo este dispositivo: el remero puede tener la app abierta en otro.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
