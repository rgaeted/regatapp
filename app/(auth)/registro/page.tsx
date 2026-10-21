import type { Metadata } from "next";
import Link from "next/link";
import { FormularioRegistro } from "./formulario";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function PaginaRegistro() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8 text-lg">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Crear cuenta</h1>
        <p className="text-base text-zinc-600">
          Después de crearla, tu entrenador la vincula a tu ficha. Hasta entonces no verás datos.
        </p>
      </div>
      <FormularioRegistro />
      <p className="text-base text-zinc-700">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-mar-700 underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
