import Link from "next/link";
import { AvatarAnillo } from "@/components/avatar-anillo";
import { requerirUsuario } from "@/lib/acceso/actual";
import { opcionesInicio } from "@/lib/inicio";
import { ocrDisponible } from "@/lib/ocr/disponible";
import { cerrarSesion } from "./actions";

const ROLES = { remero: "Remero", entrenador: "Entrenador", admin: "Administrador" } as const;

const base = "flex h-20 w-full flex-col items-center justify-center rounded-xl text-xl font-semibold";

export default async function Inicio() {
  // El layout no se re-renderiza en cada navegación del cliente: cada página
  // de (app) debe comprobar el acceso por sí misma.
  const usuario = await requerirUsuario();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 py-10 text-lg">
      <div className="flex items-center gap-4">
        <AvatarAnillo nombre={usuario.nombre} tam={56} />
        <div className="leading-tight">
          <p className="text-sm font-semibold uppercase tracking-wider text-mar-700">{ROLES[usuario.rol]}</p>
          <h1 className="text-2xl font-semibold text-zinc-900">Hola, {usuario.nombre}</h1>
        </div>
      </div>
      {opcionesInicio(usuario.rol, ocrDisponible()).map((o) =>
        o.activo ? (
          <Link
            key={o.href}
            href={o.href}
            className={`${base} ${o.principal ? "bg-zinc-900 text-white" : "bg-mar-100 text-zinc-900"}`}
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
