import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { perfilConAcceso } from "@/lib/acceso/enlace";
import { esErrorTransitorio } from "@/lib/acceso/errores-auth";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type UsuarioActual = {
  id: string;
  nombre: string;
  rol: "remero" | "entrenador" | "admin";
  atletaId: string | null;
};

export type EstadoAcceso =
  | { estado: "sin_sesion" }
  | { estado: "sin_acceso" }
  | { estado: "ok"; usuario: UsuarioActual };

/**
 * Estado de acceso de la petición, una sola vez por petición (React `cache`:
 * el layout y la página comparten el resultado).
 *
 * - `sin_sesion`: definitivamente no hay sesión válida (sin cookie, JWT
 *   inválido, usuario borrado).
 * - `sin_acceso`: sesión válida, pero la regla de acceso (`perfilConAcceso`)
 *   dice que no (atleta inactivo, consentimiento revocado, sin perfil).
 * - Un error transitorio de GoTrue (red, 5xx, 429) o de la base LANZA: lo
 *   muestra app/error.tsx con "Reintentar". Nunca se confunde con "sin sesión".
 *
 * Usa getUser(), que valida el token contra el servidor; getSession() solo lee
 * la cookie y no sirve para autorizar.
 */
export const obtenerAcceso = cache(async (): Promise<EstadoAcceso> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (esErrorTransitorio(error)) {
      throw new Error("No se pudo verificar la sesión. Intenta de nuevo.", { cause: error });
    }
    return { estado: "sin_sesion" };
  }
  if (!data.user) return { estado: "sin_sesion" };

  const perfil = await perfilConAcceso(crearClienteAdmin(), data.user.id);
  if (!perfil) return { estado: "sin_acceso" };
  return {
    estado: "ok",
    usuario: { id: data.user.id, nombre: perfil.nombre, rol: perfil.rol, atletaId: perfil.atleta_id },
  };
});

/**
 * Puerta de acceso de la zona autenticada.
 * - sin sesión: a /sin-acceso, sin tocar cookies.
 * - sin acceso: cierra la sesión (en todos los dispositivos: el acceso fue
 *   retirado) y a /sin-acceso.
 * - error transitorio: lanza (página de error con reintento), sin cerrar nada.
 *
 * IMPORTANTE: el layout de (app) NO se vuelve a renderizar en cada navegación
 * del cliente, así que no basta para proteger. TODA página, Server Action y
 * route handler futuro de (app) debe llamar a `requerirUsuario()` por su cuenta.
 */
export async function requerirUsuario(): Promise<UsuarioActual> {
  const acceso = await obtenerAcceso();
  if (acceso.estado === "ok") return acceso.usuario;
  if (acceso.estado === "sin_acceso") {
    const supabase = await crearClienteServidor();
    await supabase.auth.signOut();
  }
  redirect("/sin-acceso");
}
