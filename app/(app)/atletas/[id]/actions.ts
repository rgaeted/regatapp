"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirStaff } from "@/lib/acceso/staff";
import { cambiarActivo, generarEnlaceParaAtleta, revocarConsentimiento } from "@/lib/atletas/administrar";
import { formDataAAtleta, mensajeAlta } from "@/lib/atletas/formulario";
import { envPublico } from "@/lib/env";
import { atletaSchema } from "@/lib/schemas/atleta";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

function idDe(fd: FormData): string {
  const r = z.uuid().safeParse(fd.get("id"));
  if (!r.success) redirect("/atletas");
  return r.data;
}

function volver(id: string, error?: string): never {
  redirect(`/atletas/${id}${error ? `?e=${encodeURIComponent(error)}` : ""}`);
}

export async function editarAtletaAccion(fd: FormData): Promise<void> {
  await requerirStaff();
  const id = idDe(fd);
  const r = atletaSchema.safeParse(formDataAAtleta(fd));
  if (!r.success) volver(id, mensajeAlta(r.error));

  // Un campo vacío del formulario borra el dato: se manda null explícito.
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("atleta")
    .update({
      nombre: d.nombre,
      apellido: d.apellido,
      fecha_nacimiento: d.fecha_nacimiento ?? null,
      sexo: d.sexo ?? null,
      peso_kg: d.peso_kg ?? null,
      altura_cm: d.altura_cm ?? null,
      categoria_peso: d.categoria_peso ?? null,
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) volver(id, "No se pudo guardar los cambios.");
  volver(id);
}

export async function cambiarActivoAccion(fd: FormData): Promise<void> {
  await requerirStaff();
  const id = idDe(fd);
  const supabase = await crearClienteServidor();
  const r = await cambiarActivo(supabase, id, fd.get("activo") === "1");
  volver(id, r.ok ? undefined : r.error);
}

export async function revocarConsentimientoAccion(fd: FormData): Promise<void> {
  await requerirStaff();
  const id = idDe(fd);
  const supabase = await crearClienteServidor();
  const r = await revocarConsentimiento(supabase, crearClienteAdmin(), id);
  volver(id, r.ok ? undefined : r.error);
}

export async function generarEnlaceAccion(atletaId: string): Promise<{ url: string } | { error: string }> {
  const usuario = await requerirStaff();
  const id = z.uuid().safeParse(atletaId);
  if (!id.success) return { error: "Atleta no válido." };
  const supabase = await crearClienteServidor();
  return generarEnlaceParaAtleta(supabase, crearClienteAdmin(), usuario.id, id.data, envPublico.NEXT_PUBLIC_SITE_URL);
}
