import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Funciones de alta de usuarios de acceso. Reciben el cliente service role y
 * NO autorizan al llamador: asumen un contexto de servidor de confianza.
 * Sin `server-only` para que las reutilicen scripts y vitest.
 */

/** Correo que nadie lee; el único lugar donde se define el dominio sintético. */
export function correoSintetico(prefijo: "a" | "u", id: string): string {
  return `${prefijo}-${id}@remeros.invalid`;
}

const POR_PAGINA = 200;

async function buscarUsuarioPorCorreo(admin: SupabaseClient, correo: string): Promise<string | null> {
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hallado = data.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase());
    if (hallado) return hallado.id;
    if (data.users.length < POR_PAGINA) return null;
  }
}

/**
 * Crea (o reutiliza) el usuario de Auth de un atleta, su perfil de remero y
 * fija `atleta.user_id`. Idempotente y segura ante llamadas concurrentes: el
 * correo es determinista, así que un segundo createUser falla por duplicado y
 * se re-lee el usuario existente; los pasos siguientes son idempotentes.
 *
 * El llamador debe verificar que el usuario puede generar este enlace:
 * entrenador solo para atletas que entrena; solo admin para staff.
 */
export async function asegurarUsuarioAtleta(admin: SupabaseClient, atletaId: string): Promise<string> {
  const { data: atleta, error: errAtleta } = await admin
    .from("atleta")
    .select("nombre, apellido, user_id")
    .eq("id", atletaId)
    .maybeSingle();
  if (errAtleta) throw new Error(`atleta: ${errAtleta.message}`);
  if (!atleta) throw new Error("El atleta no existe");
  if (atleta.user_id) return atleta.user_id as string;

  const correo = correoSintetico("a", atletaId);
  let usuarioId: string | null = null;
  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email: correo,
    email_confirm: true,
  });
  if (creado?.user) {
    usuarioId = creado.user.id;
  } else {
    // Otra llamada (o un intento anterior interrumpido) ya lo creó: re-leer.
    usuarioId = await buscarUsuarioPorCorreo(admin, correo);
    if (!usuarioId) throw new Error(`createUser: ${errCrear?.message ?? "sin respuesta"}`);
  }

  const { error: errPerfil } = await admin.from("perfil").upsert(
    {
      user_id: usuarioId,
      rol: "remero",
      atleta_id: atletaId,
      nombre: `${atleta.nombre} ${atleta.apellido}`,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (errPerfil) throw new Error(`perfil: ${errPerfil.message}`);

  // Solo si sigue vacío: la primera llamada gana y todas devuelven ese valor.
  const { error: errUpd } = await admin
    .from("atleta")
    .update({ user_id: usuarioId })
    .eq("id", atletaId)
    .is("user_id", null);
  if (errUpd) throw new Error(`atleta.user_id: ${errUpd.message}`);

  const { data: final, error: errFinal } = await admin
    .from("atleta")
    .select("user_id")
    .eq("id", atletaId)
    .single();
  if (errFinal || !final?.user_id) throw new Error(`atleta.user_id: ${errFinal?.message ?? "no quedó asignado"}`);
  return final.user_id as string;
}

/**
 * Crea un entrenador o admin con su perfil. Si falla el perfil, borra el
 * usuario recién creado para no dejar cuentas huérfanas.
 *
 * El llamador debe verificar que el usuario puede generar este enlace:
 * entrenador solo para atletas que entrena; solo admin para staff.
 */
export async function crearUsuarioStaff(
  admin: SupabaseClient,
  opts: { nombre: string; rol: "entrenador" | "admin"; correo?: string },
): Promise<string> {
  const email = opts.correo ?? correoSintetico("u", randomUUID());
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "sin respuesta"}`);
  const id = data.user.id;
  const { error: errPerfil } = await admin
    .from("perfil")
    .insert({ user_id: id, rol: opts.rol, nombre: opts.nombre });
  if (errPerfil) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(`perfil: ${errPerfil.message}`);
  }
  return id;
}
