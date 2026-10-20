import Link from "next/link";
import { requerirUsuario } from "@/lib/acceso/actual";
import { cerrarSesion } from "./actions";

export default async function Inicio() {
  // El layout no se re-renderiza en cada navegación del cliente: cada página
  // de (app) debe comprobar el acceso por sí misma.
  const usuario = await requerirUsuario();
  const boton =
    "flex h-20 w-full flex-col items-center justify-center rounded-xl bg-zinc-200 text-xl font-semibold text-zinc-600";
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-10 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Hola, {usuario.nombre}</h1>
      <button type="button" disabled className={boton}>
        Foto del ergómetro
        <span className="text-base font-normal">Pronto</span>
      </button>
      <Link
        href="/sesion/nueva"
        className="flex h-20 w-full items-center justify-center rounded-xl bg-zinc-900 text-xl font-semibold text-white"
      >
        Cargar a mano
      </Link>
      <form action={cerrarSesion} className="mt-auto pt-8">
        <button type="submit" className="text-lg text-zinc-700 underline">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
