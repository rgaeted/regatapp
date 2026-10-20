import Link from "next/link";
import { cookies } from "next/headers";
import { requerirUsuario } from "@/lib/acceso/actual";
import { atletaPorDefecto, atletasVisibles, COOKIE_ULTIMO_ATLETA } from "@/lib/atletas/lista";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormularioSesion } from "./formulario";

export default async function PaginaSesionNueva() {
  const usuario = await requerirUsuario();
  const supabase = await crearClienteServidor();

  // Remero: solo él mismo, sin selector. Staff: los atletas que ve por RLS.
  const atletas =
    usuario.rol === "remero"
      ? usuario.atletaId
        ? [{ id: usuario.atletaId, nombre: usuario.nombre, apellido: "" }]
        : []
      : await atletasVisibles(supabase);

  if (atletas.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-6 py-10 text-lg">
        <p>Todavía no tienes atletas asignados.</p>
        {usuario.rol !== "remero" && (
          <Link href="/atletas/nuevo" className="font-semibold text-zinc-900 underline">
            Crear un atleta
          </Link>
        )}
      </main>
    );
  }

  const ultimo = (await cookies()).get(COOKIE_ULTIMO_ATLETA)?.value;
  return (
    <FormularioSesion
      atletas={atletas}
      atletaInicial={atletaPorDefecto(atletas, ultimo)}
      mostrarSelector={usuario.rol !== "remero"}
    />
  );
}
