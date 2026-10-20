import "server-only";
import { redirect } from "next/navigation";
import { requerirUsuario, type UsuarioActual } from "@/lib/acceso/actual";

/** Entrenador o admin; un remero vuelve al inicio. Úsalo en cada página y acción de staff. */
export async function requerirStaff(): Promise<UsuarioActual> {
  const usuario = await requerirUsuario();
  if (usuario.rol === "remero") redirect("/");
  return usuario;
}

/** Solo admin; cualquier otro vuelve al inicio. */
export async function requerirAdmin(): Promise<UsuarioActual> {
  const usuario = await requerirUsuario();
  if (usuario.rol !== "admin") redirect("/");
  return usuario;
}
