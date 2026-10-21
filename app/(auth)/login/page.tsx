import type { Metadata } from "next";
import Link from "next/link";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Entrar</h1>
      <FormularioLogin />
      <p className="text-base text-zinc-700">
        ¿Primera vez?{" "}
        <Link href="/registro" className="font-semibold text-mar-700 underline">
          Crear una cuenta
        </Link>
      </p>
    </main>
  );
}
