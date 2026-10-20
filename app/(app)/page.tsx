import Link from "next/link";
import { requerirUsuario } from "@/lib/acceso/actual";
import { opcionesInicio } from "@/lib/inicio";
import { cerrarSesion } from "./actions";

const base = "flex h-20 w-full flex-col items-center justify-center rounded-xl text-xl font-semibold";

export default async function Inicio() {
  // El layout no se re-renderiza en cada navegación del cliente: cada página
  // de (app) debe comprobar el acceso por sí misma.
  const usuario = await requerirUsuario();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 py-10 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Hola, {usuario.nombre}</h1>
      {opcionesInicio(usuario.rol).map((o) =>
        o.activo ? (
          <Link
            key={o.href}
            href={o.href}
            className={`${base} ${o.principal ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-900"}`}
          >
            {o.texto}
          </Link>
        ) : (
          <button key={o.href} type="button" disabled className={`${base} bg-zinc-200 text-zinc-600`}>
            {o.texto}
            <span className="text-base font-normal">Pronto</span>
          </button>
        ),
      )}
      <form action={cerrarSesion} className="mt-auto pt-8">
        <button type="submit" className="text-lg text-zinc-700 underline">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
