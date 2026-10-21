import Link from "next/link";
import { cookies } from "next/headers";
import { z } from "zod";
import { requerirUsuario } from "@/lib/acceso/actual";
import { atletaPorDefecto, atletasVisibles, COOKIE_ULTIMO_ATLETA } from "@/lib/atletas/lista";
import { lecturaModeloSchema, normalizarLectura, type LecturaOcr } from "@/lib/ocr/lectura";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormularioSesion } from "./formulario";

export default async function PaginaSesionNueva({ searchParams }: PageProps<"/sesion/nueva">) {
  const usuario = await requerirUsuario();
  const sp = await searchParams;
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

  // Sesión desde una foto (fase 2): la captura la filtra RLS (solo la propia).
  let capturaId: string | null = null;
  let lectura: LecturaOcr | null = null;
  const pedida = z.uuid().safeParse(typeof sp.captura === "string" ? sp.captura : "");
  if (pedida.success) {
    const { data } = await supabase.from("captura").select("id, respuesta_cruda").eq("id", pedida.data).maybeSingle();
    if (data) {
      capturaId = data.id as string;
      const cruda = lecturaModeloSchema.safeParse(data.respuesta_cruda);
      if (cruda.success) lectura = normalizarLectura(cruda.data);
    }
  }

  const ultimo = (await cookies()).get(COOKIE_ULTIMO_ATLETA)?.value;
  return (
    <FormularioSesion
      // Una foto distinta es un formulario distinto.
      key={capturaId ?? "manual"}
      atletas={atletas}
      atletaInicial={atletaPorDefecto(atletas, ultimo)}
      mostrarSelector={usuario.rol !== "remero"}
      capturaId={capturaId}
      lectura={lectura}
      aviso={typeof sp.aviso === "string" ? sp.aviso : undefined}
    />
  );
}
