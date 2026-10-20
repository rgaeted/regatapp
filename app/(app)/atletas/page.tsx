import Link from "next/link";
import { requerirStaff } from "@/lib/acceso/staff";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ListaAtletas } from "./lista";

export default async function PaginaAtletas() {
  await requerirStaff();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("atleta")
    .select("id, nombre, apellido, activo")
    .order("apellido")
    .order("nombre");
  if (error) throw new Error(`atletas: ${error.message}`);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 py-8 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Atletas</h1>
      <Link
        href="/atletas/nuevo"
        className="flex h-16 items-center justify-center rounded-xl bg-zinc-900 text-xl font-semibold text-white"
      >
        Nuevo atleta
      </Link>
      <ListaAtletas atletas={data ?? []} />
      <Link href="/" className="pt-4 text-zinc-700 underline">Volver al inicio</Link>
    </main>
  );
}
