import Link from "next/link";
import { cookies } from "next/headers";
import { requerirUsuario } from "@/lib/acceso/actual";
import { atletaPorDefecto, atletasVisibles, COOKIE_ULTIMO_ATLETA } from "@/lib/atletas/lista";
import { listarSesiones } from "@/lib/sesion/listar";
import { verificarSesionAccion } from "./actions";
import { crearClienteServidor } from "@/lib/supabase/server";

const TIPOS: Record<string, string> = { entrenamiento: "Entrenamiento", test: "Test", competencia: "Competencia" };

export default async function PaginaSesiones({ searchParams }: PageProps<"/sesiones">) {
  const usuario = await requerirUsuario();
  const sp = await searchParams;
  const supabase = await crearClienteServidor();
  const esRemero = usuario.rol === "remero";

  const atletas = esRemero ? [] : await atletasVisibles(supabase);
  const pedido = typeof sp.atleta === "string" ? sp.atleta : undefined;
  const ultimo = (await cookies()).get(COOKIE_ULTIMO_ATLETA)?.value;
  const atletaId = esRemero ? usuario.atletaId : atletaPorDefecto(atletas, pedido ?? ultimo);

  if (!atletaId) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-10 text-lg">
        <p>Todavía no tienes atletas asignados.</p>
        <Link href="/" className="mt-4 inline-block underline">Volver</Link>
      </main>
    );
  }

  // Un tercero que mira a un atleta queda registrado (diseño §5.2). Va en paralelo con la lectura:
  // son independientes y cada ida y vuelta a la base suma tiempo.
  const registro =
    atletaId !== usuario.atletaId
      ? supabase.rpc("registrar_acceso", { p_atleta_id: atletaId, p_accion: "ver_sesiones", p_detalle: null })
      : Promise.resolve();
  const [filas] = await Promise.all([listarSesiones(supabase, atletaId), registro]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 py-8 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Sesiones</h1>

      {sp.guardada === "1" && (
        <p role="status" className="rounded-lg bg-green-100 px-3 py-2 font-medium text-green-900">
          Sesión guardada
        </p>
      )}

      {!esRemero && atletas.length > 0 && (
        <form method="get" className="flex gap-2">
          <select name="atleta" defaultValue={atletaId} className="h-14 flex-1 rounded-xl border border-zinc-300 bg-white px-3">
            {atletas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.apellido}, {a.nombre}
              </option>
            ))}
          </select>
          <button type="submit" className="h-14 rounded-xl bg-zinc-200 px-5 font-semibold">Ver</button>
        </form>
      )}

      <Link
        href="/sesion/nueva"
        className="flex h-16 items-center justify-center rounded-xl bg-zinc-900 text-xl font-semibold text-white"
      >
        Cargar sesión
      </Link>

      {filas.length === 0 ? (
        <p className="text-zinc-600">Aún no hay sesiones.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">
                  {f.distancia_m ? `${f.distancia_m} m` : "—"} · {f.tiempo}
                </span>
                <span className="text-base text-zinc-600">{f.fecha}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-base text-zinc-700">
                <span>{TIPOS[f.tipo] ?? f.tipo}</span>
                <span>/500: {f.split500}</span>
                {f.spm !== null && <span>{f.spm} spm</span>}
                {f.watts !== null && <span>{f.watts} W</span>}
                {!f.verificado && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-900">
                    Sin verificar
                  </span>
                )}
                {!f.verificado && (
                  <form action={verificarSesionAccion}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="atleta" value={atletaId} />
                    <button type="submit" className="h-10 rounded-lg bg-zinc-900 px-3 text-sm font-semibold text-white">
                      Marcar como verificada
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link href={esRemero ? "/progreso" : `/progreso?atleta=${atletaId}`} className="font-semibold text-zinc-900 underline">
        Ver progreso
      </Link>
      <Link href="/" className="pt-4 text-zinc-700 underline">Volver al inicio</Link>
    </main>
  );
}
