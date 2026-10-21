import type { Metadata } from "next";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Entrar</h1>
      <p className="text-base text-zinc-600">Para entrenadores y administradores. Los remeros entran con el enlace que les manda su entrenador.</p>
      <FormularioLogin />
    </main>
  );
}
