"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirAdmin, requerirStaff } from "@/lib/acceso/staff";
import { cambiarActivo, generarEnlaceParaAtleta, revocarConsentimiento } from "@/lib/atletas/administrar";
import { desvincularCuenta, vincularCuenta } from "@/lib/acceso/vincular";
import { eliminarAtleta } from "@/lib/atletas/eliminar";
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

/** Solo admin; exige escribir el apellido del atleta como confirmación. */
export async function eliminarAtletaAccion(fd: FormData): Promise<void> {
  const usuario = await requerirAdmin();
  const id = idDe(fd);
  const supabase = await crearClienteServidor();
  const { data: atleta } = await supabase.from("atleta").select("apellido").eq("id", id).maybeSingle();
  if (!atleta) redirect("/atletas");

  const confirmacion = String(fd.get("confirmacion") ?? "").trim().toLowerCase();
  if (confirmacion !== String(atleta.apellido).trim().toLowerCase()) {
    volver(id, "Para eliminar, escribe el apellido del atleta exactamente.");
  }
  try {
    await eliminarAtleta(crearClienteAdmin(), id, usuario.id);
  } catch {
    volver(id, "No se pudo eliminar todo. Intenta de nuevo; el proceso se puede repetir.");
  }
  redirect("/atletas");
}

export async function vincularCuentaAccion(fd: FormData): Promise<void> {
  await requerirStaff();
  const id = idDe(fd);
  const cuenta = z.uuid().safeParse(fd.get("cuenta"));
  if (!cuenta.success) volver(id, "Elige una cuenta.");
  const supabase = await crearClienteServidor();
  const r = await vincularCuenta(supabase, crearClienteAdmin(), id, cuenta.data);
  if (r.ok) {
    await supabase.rpc("registrar_acceso", { p_atleta_id: id, p_accion: "vincular_cuenta", p_detalle: { cuenta: cuenta.data } });
  }
  volver(id, r.ok ? undefined : r.error);
}

export async function desvincularCuentaAccion(fd: FormData): Promise<void> {
  await requerirStaff();
  const id = idDe(fd);
  const supabase = await crearClienteServidor();
  const r = await desvincularCuenta(supabase, crearClienteAdmin(), id);
  if (r.ok) await supabase.rpc("registrar_acceso", { p_atleta_id: id, p_accion: "desvincular_cuenta", p_detalle: null });
  volver(id, r.ok ? undefined : r.error);
}

export async function generarEnlaceAccion(atletaId: string): Promise<{ url: string } | { error: string }> {
  const usuario = await requerirStaff();
  const id = z.uuid().safeParse(atletaId);
  if (!id.success) return { error: "Atleta no válido." };
  const supabase = await crearClienteServidor();
  return generarEnlaceParaAtleta(supabase, crearClienteAdmin(), usuario.id, id.data, envPublico.NEXT_PUBLIC_SITE_URL);
}
