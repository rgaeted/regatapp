import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirUsuario } from "@/lib/acceso/actual";
import { ocrDisponible } from "@/lib/ocr/disponible";
import { CamaraOcr } from "./camara";

export default async function PaginaFoto() {
  const usuario = await requerirUsuario();
  // Sin la clave del modelo no hay lectura: no se sube una foto para nada.
  if (!ocrDisponible()) redirect("/sesion/nueva?aviso=sin_configurar");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Foto del ergómetro</h1>
      <p className="text-base text-zinc-600">
        Saca la foto de frente a la pantalla del PM5, sin reflejos. Después revisas los datos antes de guardar.
      </p>
      <CamaraOcr usuarioId={usuario.id} />
      <Link href="/sesion/nueva" className="flex h-14 items-center justify-center rounded-xl bg-zinc-200 text-lg font-semibold">
        Cargar a mano
      </Link>
      <Link href="/" className="text-zinc-700 underline">Volver al inicio</Link>
    </main>
  );
}
