import "server-only";
import { redirect } from "next/navigation";
import { accesoVigente } from "@/lib/acceso/enlace";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type UsuarioActual = {
  id: string;
  nombre: string;
  rol: "remero" | "entrenador" | "admin";
  atletaId: string | null;
};

/**
 * Usuario de la petición, o null si no hay sesión válida o ya no tiene acceso
 * (atleta inactivo, consentimiento revocado). Usa getUser(), que valida el
 * token contra el servidor; getSession() solo lee la cookie y no sirve para
 * autorizar.
 */
export async function obtenerUsuarioActual(): Promise<UsuarioActual | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const admin = crearClienteAdmin();
  const { data: perfil, error: errPerfil } = await admin
    .from("perfil")
    .select("rol, nombre, atleta_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (errPerfil) throw new Error(`perfil: ${errPerfil.message}`);
  if (!perfil) return null;
  if (!(await accesoVigente(admin, data.user.id))) return null;

  return {
    id: data.user.id,
    nombre: perfil.nombre as string,
    rol: perfil.rol as UsuarioActual["rol"],
    atletaId: (perfil.atleta_id as string | null) ?? null,
  };
}

/**
 * Puerta de acceso de la zona autenticada. Si no hay acceso vigente cierra la
 * sesión (si existía) y manda a /sin-acceso.
 *
 * IMPORTANTE: el layout de (app) NO se vuelve a renderizar en cada navegación
 * del cliente, así que no basta para proteger. TODA página, Server Action y
 * route handler futuro de (app) debe llamar a `requerirUsuario()` por su cuenta.
 */
export async function requerirUsuario(): Promise<UsuarioActual> {
  const usuario = await obtenerUsuarioActual();
  if (usuario) return usuario;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.auth.signOut();
  redirect("/sin-acceso");
}
