"use server";

import { redirect } from "next/navigation";
import { requerirStaff } from "@/lib/acceso/staff";
import { formDataAAlta, mensajeAlta } from "@/lib/atletas/formulario";
import { altaAtletaSchema } from "@/lib/schemas/consentimiento";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAlta = { error?: string; valores?: Record<string, string> };

export async function crearAtletaAccion(_previo: EstadoAlta, fd: FormData): Promise<EstadoAlta> {
  await requerirStaff();
  // Se devuelven los valores para que el formulario no quede en blanco tras un error.
  const valores = Object.fromEntries(
    [...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string"),
  );

  const r = altaAtletaSchema.safeParse(formDataAAlta(fd));
  if (!r.success) return { error: mensajeAlta(r.error), valores };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_atleta_con_consentimiento", {
    p_atleta: r.data.atleta,
    p_consentimiento: r.data.consentimiento,
  });
  if (error || !data) return { error: "No se pudo crear el atleta. Intenta de nuevo.", valores };
  redirect(`/atletas/${data as string}`);
}
