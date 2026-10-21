import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerAcceso } from "@/lib/acceso/actual";
import { cerrarSesion } from "@/app/(app)/actions";

export const metadata: Metadata = { title: "Cuenta pendiente" };

// Pantalla de espera: la cuenta existe pero aún no está vinculada a un atleta.
export default async function PaginaPendiente() {
  const acceso = await obtenerAcceso();
  if (acceso.estado === "ok") redirect("/");
  if (acceso.estado !== "pendiente") redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8 text-lg">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-mar-700">Cuenta creada</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Hola, {acceso.nombre}</h1>
      </div>
      <p>
        Falta un paso: <strong>tu entrenador debe vincular tu cuenta a tu ficha</strong>. Cuando lo haga, entras
        a la app sin hacer nada más.
      </p>
      {acceso.usuario && (
        <p className="rounded-lg bg-zinc-100 px-4 py-3 text-base">
          Dile que tu usuario es <strong className="cifras">{acceso.usuario}</strong>.
        </p>
      )}
      <p className="text-base text-zinc-600">Vuelve a abrir la app en un rato; esta pantalla se actualiza al recargar.</p>
      <form action={cerrarSesion}>
        <button type="submit" className="text-lg text-zinc-700 underline">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
