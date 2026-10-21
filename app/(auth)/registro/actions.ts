"use server";

import { redirect } from "next/navigation";
import { iniciarConClave } from "@/lib/acceso/clave";
import { registrarCuenta, validarRegistro, type ErroresRegistro } from "@/lib/acceso/registro";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoRegistro = { errores?: ErroresRegistro; error?: string; valores?: { nombre: string; usuario: string } };

export async function registrarseAccion(_previo: EstadoRegistro, fd: FormData): Promise<EstadoRegistro> {
  const nombre = String(fd.get("nombre") ?? "");
  const usuario = String(fd.get("usuario") ?? "");
  const clave = String(fd.get("clave") ?? "");
  const valores = { nombre, usuario };

  // Campo señuelo, invisible para las personas: los programas que rellenan todo lo llenan.
  if (String(fd.get("sitio_web") ?? "") !== "") return { error: "No se pudo crear la cuenta.", valores };

  const v = validarRegistro({ nombre, usuario, clave });
  if (!v.ok) return { errores: v.errores, valores };

  const admin = crearClienteAdmin();
  const r = await registrarCuenta(admin, v.datos);
  if (!r.ok) return { error: r.error, valores };

  // Entra de inmediato; queda en la pantalla de espera hasta que la vinculen.
  const entrada = await iniciarConClave(await crearClienteServidor(), admin, v.datos.usuario, v.datos.clave);
  redirect(entrada.ok ? "/" : "/login");
}
