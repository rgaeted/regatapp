import type { Metadata } from "next";
import { MENSAJES_ENLACE, resolverEnlace } from "@/lib/acceso/enlace";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { entrar } from "./actions";

// El token viaja en la query: que no se indexe ni salga en el Referer.
// Sin `dynamic` explícito: leer searchParams ya vuelve la página dinámica.
export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const MOTIVOS = ["inexistente", "vencido", "usado", "sin_acceso", "reintentar"] as const;
type Motivo = (typeof MOTIVOS)[number];

export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const t = typeof sp.t === "string" ? sp.t : "";
  const e = typeof sp.e === "string" ? sp.e : "";

  // SOLO LECTURA: nada de verifyOtp, marcarUsado ni cookies en el GET.
  let motivo: Motivo | null = null;
  let nombre = "";
  if (MOTIVOS.includes(e as Motivo)) {
    // Volvió de un intento fallido de la acción.
    motivo = e as Motivo;
  } else {
    const r = await resolverEnlace(crearClienteAdmin(), t);
    if (r.ok) nombre = r.nombre;
    else motivo = r.motivo;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-10 text-lg">
      {motivo ? (
        <p role="alert" className="text-2xl font-semibold text-zinc-900">
          {MENSAJES_ENLACE[motivo]}
        </p>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-zinc-900">Entrar como {nombre}</h1>
          <form action={entrar}>
            <input type="hidden" name="t" value={t} />
            <button
              type="submit"
              className="h-20 w-full rounded-xl bg-blue-700 text-2xl font-semibold text-white active:bg-blue-900"
            >
              Entrar
            </button>
          </form>
        </>
      )}
    </main>
  );
}
