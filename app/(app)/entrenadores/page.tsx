import Link from "next/link";
import { requerirAdmin } from "@/lib/acceso/staff";
import { atletasVisibles } from "@/lib/atletas/lista";
import { hoySantiago } from "@/lib/schemas/consentimiento";
import { crearClienteServidor } from "@/lib/supabase/server";
import { asignarAtletaAccion, terminarAsignacionAccion } from "./actions";
import { EnlaceEntrenador, FormularioEntrenador } from "./formulario";

type Asignacion = { entrenador_id: string; atleta_id: string; hasta: string | null };

export default async function PaginaEntrenadores({ searchParams }: PageProps<"/entrenadores">) {
  await requerirAdmin();
  const sp = await searchParams;
  const supabase = await crearClienteServidor();

  const [{ data: entrenadores, error: e1 }, { data: asignaciones, error: e2 }, atletas] = await Promise.all([
    supabase.from("perfil").select("user_id, nombre").eq("rol", "entrenador").order("nombre"),
    supabase.from("asignacion_entrenador").select("entrenador_id, atleta_id, hasta"),
    atletasVisibles(supabase),
  ]);
  if (e1) throw new Error(`entrenadores: ${e1.message}`);
  if (e2) throw new Error(`asignaciones: ${e2.message}`);

  const hoy = hoySantiago();
  const vigentes = ((asignaciones ?? []) as Asignacion[]).filter((a) => a.hasta === null || a.hasta >= hoy);
  const nombreAtleta = new Map(atletas.map((a) => [a.id, `${a.apellido}, ${a.nombre}`]));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Entrenadores</h1>
      {typeof sp.e === "string" && <p role="alert" className="font-medium text-red-700">{sp.e}</p>}

      <FormularioEntrenador />

      <ul className="flex flex-col gap-4">
        {(entrenadores ?? []).map((ent) => {
          const suyas = vigentes.filter((a) => a.entrenador_id === ent.user_id);
          const asignados = new Set(suyas.map((a) => a.atleta_id));
          const libres = atletas.filter((a) => !asignados.has(a.id));
          return (
            <li key={ent.user_id} className="flex flex-col gap-3 rounded-xl border border-zinc-300 p-4">
              <h2 className="text-xl font-semibold">{ent.nombre || "Sin nombre"}</h2>
              {suyas.length === 0 ? (
                <p className="text-base text-zinc-600">Sin atletas asignados.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {suyas.map((a) => (
                    <li key={a.atleta_id} className="flex items-center justify-between gap-2 text-base">
                      <span>{nombreAtleta.get(a.atleta_id) ?? "Atleta inactivo"}</span>
                      <form action={terminarAsignacionAccion}>
                        <input type="hidden" name="entrenador" value={ent.user_id} />
                        <input type="hidden" name="atleta" value={a.atleta_id} />
                        <button type="submit" className="h-11 rounded-lg bg-zinc-200 px-4 font-medium">Quitar</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              {libres.length > 0 && (
                <form action={asignarAtletaAccion} className="flex gap-2">
                  <input type="hidden" name="entrenador" value={ent.user_id} />
                  <select name="atleta" className="h-14 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-base">
                    {libres.map((a) => (
                      <option key={a.id} value={a.id}>{a.apellido}, {a.nombre}</option>
                    ))}
                  </select>
                  <button type="submit" className="h-14 rounded-xl bg-zinc-900 px-5 font-semibold text-white">Asignar</button>
                </form>
              )}
              <EnlaceEntrenador usuarioId={ent.user_id} nombre={ent.nombre} />
            </li>
          );
        })}
      </ul>
      <Link href="/" className="pt-2 text-zinc-700 underline">Volver al inicio</Link>
    </main>
  );
}
