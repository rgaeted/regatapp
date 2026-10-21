import Link from "next/link";

export default function SinAcceso() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10 text-lg">
      <p className="text-2xl font-semibold text-zinc-900">
        Tu acceso está desactivado.
      </p>
      <p className="text-base text-zinc-700">Habla con tu entrenador: puede que el consentimiento esté pendiente o que tu ficha esté inactiva.</p>
      <Link href="/login" className="font-semibold text-mar-700 underline">
        Entrar con otra cuenta
      </Link>
    </main>
  );
}
