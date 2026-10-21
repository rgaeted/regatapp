import Link from "next/link";

export default function SinAcceso() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10 text-lg">
      <p className="text-2xl font-semibold text-zinc-900">
        Para entrar necesitas un enlace de tu entrenador.
      </p>
      <Link href="/login" className="text-zinc-700 underline">
        Soy entrenador o administrador
      </Link>
    </main>
  );
}
