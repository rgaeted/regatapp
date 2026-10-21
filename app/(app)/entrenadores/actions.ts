"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirAdmin } from "@/lib/acceso/staff";
import { generarEnlace } from "@/lib/acceso/enlace";
import { eliminarCuentaPendiente } from "@/lib/acceso/vincular";
import { asignarAtleta, crearEntrenador, ErrorUsuario, fijarClaveEntrenador, terminarAsignacion } from "@/lib/atletas/entrenadores";
import { envPublico } from "@/lib/env";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoEntrenador = { error?: string; url?: string; nombre?: string; usuario?: string };

export async function crearEntrenadorAccion(_previo: EstadoEntrenador, fd: FormData): Promise<EstadoEntrenador> {
  const usuario = await requerirAdmin();
  const nombre = z.string().trim().min(1).safeParse(fd.get("nombre"));
  if (!nombre.success) return { error: "Escribe el nombre del entrenador." };

  // Usuario y contraseña son opcionales, pero van juntos: ambos o ninguno.
  const usuarioIngresado = String(fd.get("usuario") ?? "").trim();
  const clave = String(fd.get("clave") ?? "");
  if ((usuarioIngresado === "") !== (clave === "")) {
    return { error: "Escribe usuario y contraseña, o deja ambos vacíos para dar solo un enlace de acceso." };
  }
  try {
    const r = await crearEntrenador(crearClienteAdmin(), {
      nombre: nombre.data,
      creadoPor: usuario.id,
      siteUrl: envPublico.NEXT_PUBLIC_SITE_URL,
      acceso: usuarioIngresado ? { usuario: usuarioIngresado, clave } : undefined,
    });
    return { url: r.url, nombre: nombre.data, usuario: r.usuario };
  } catch (e) {
    return { error: e instanceof ErrorUsuario ? e.message : "No se pudo crear al entrenador. Intenta de nuevo." };
  }
}

export type EstadoClave = { ok?: string; error?: string };

/** Fija o cambia el usuario y la contraseña de un entrenador existente. */
export async function fijarClaveEntrenadorAccion(_previo: EstadoClave, fd: FormData): Promise<EstadoClave> {
  await requerirAdmin();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Entrenador no válido." };
  const admin = crearClienteAdmin();
  // Solo cuentas de entrenador: las de admin se manejan por script y las de remeros no llevan clave desde acá.
  const { data: perfil } = await admin.from("perfil").select("rol").eq("user_id", id.data).maybeSingle();
  if (perfil?.rol !== "entrenador") return { error: "Esa persona no es entrenador." };
  try {
    const usuario = await fijarClaveEntrenador(admin, id.data, {
      usuario: String(fd.get("usuario") ?? ""),
      clave: String(fd.get("clave") ?? ""),
    });
    return { ok: `Listo: entra con el usuario "${usuario}".` };
  } catch (e) {
    return { error: e instanceof ErrorUsuario ? e.message : "No se pudo guardar. Intenta de nuevo." };
  }
}

/** Nuevo enlace para un entrenador que perdió el celular o cerró sesión. */
export async function regenerarEnlaceEntrenadorAccion(usuarioId: string): Promise<{ url: string } | { error: string }> {
  const usuario = await requerirAdmin();
  const id = z.uuid().safeParse(usuarioId);
  if (!id.success) return { error: "Entrenador no válido." };
  const admin = crearClienteAdmin();
  // Solo cuentas de entrenador: los enlaces de atletas salen de su ficha.
  const { data: perfil } = await admin.from("perfil").select("rol").eq("user_id", id.data).maybeSingle();
  if (perfil?.rol !== "entrenador") return { error: "Esa persona no es entrenador." };
  try {
    const url = await generarEnlace(admin, { usuarioId: id.data, creadoPor: usuario.id, siteUrl: envPublico.NEXT_PUBLIC_SITE_URL });
    return { url };
  } catch {
    return { error: "No se pudo generar el enlace." };
  }
}

const parSchema = z.object({ entrenador: z.uuid(), atleta: z.uuid() });

function volver(error?: string): never {
  redirect(`/entrenadores${error ? `?e=${encodeURIComponent(error)}` : ""}`);
}

export async function asignarAtletaAccion(fd: FormData): Promise<void> {
  await requerirAdmin();
  const par = parSchema.safeParse({ entrenador: fd.get("entrenador"), atleta: fd.get("atleta") });
  if (!par.success) volver("Elige un atleta.");
  const supabase = await crearClienteServidor();
  const r = await asignarAtleta(supabase, crearClienteAdmin(), par.data.entrenador, par.data.atleta);
  volver(r.ok ? undefined : r.error);
}

export async function eliminarCuentaPendienteAccion(fd: FormData): Promise<void> {
  await requerirAdmin();
  const id = z.uuid().safeParse(fd.get("cuenta"));
  if (!id.success) volver();
  const r = await eliminarCuentaPendiente(crearClienteAdmin(), id.data);
  volver(r.ok ? undefined : r.error);
}

export async function terminarAsignacionAccion(fd: FormData): Promise<void> {
  await requerirAdmin();
  const par = parSchema.safeParse({ entrenador: fd.get("entrenador"), atleta: fd.get("atleta") });
  if (!par.success) volver();
  const supabase = await crearClienteServidor();
  const r = await terminarAsignacion(supabase, par.data.entrenador, par.data.atleta);
  volver(r.ok ? undefined : r.error);
}
