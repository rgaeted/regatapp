import Link from "next/link";
import { AvatarAnillo } from "@/components/avatar-anillo";
import { cookies } from "next/headers";
import { requerirUsuario } from "@/lib/acceso/actual";
import { atletaPorDefecto, atletasVisibles, COOKIE_ULTIMO_ATLETA } from "@/lib/atletas/lista";
import {
  distanciasConCurva,
  recordsPorDistancia,
  resumenProgreso,
  serieSplit,
  volumenSemanal,
} from "@/lib/progreso/calculos";
import { cargarProgreso } from "@/lib/progreso/cargar";
import { fechaLarga, kilometros, nombreDistancia } from "@/lib/progreso/formato";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatTiempo } from "@/lib/tiempo";
import { BarrasVolumen } from "@/components/graficos/barras-volumen";
import { CurvaSplit } from "@/components/graficos/curva-split";

const TIPOS: Record<string, string> = { entrenamiento: "Entrenamiento", test: "Test", competencia: "Competencia" };
const chip = (activo: boolean) =>
  `flex h-12 min-w-14 items-center justify-center rounded-xl px-4 text-base font-semibold ${
    activo ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-900"
  }`;

export default async function PaginaProgreso({ searchParams }: PageProps<"/progreso">) {
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

  // Un tercero que mira el progreso de un atleta queda registrado (diseño §5.2), en paralelo con la lectura.
  let registro: PromiseLike<unknown> = Promise.resolve();
  if (atletaId !== usuario.atletaId) {
    registro = supabase.rpc("registrar_acceso", { p_atleta_id: atletaId, p_accion: "ver_progreso", p_detalle: null });
  }

  const [{ filas, sinVerificar }] = await Promise.all([cargarProgreso(supabase, atletaId), registro]);
  const resumen = resumenProgreso(filas, sinVerificar);
  const records = recordsPorDistancia(filas);
  const distancias = distanciasConCurva(filas);
  const pedidaD = Number(typeof sp.d === "string" ? sp.d : "");
  const distancia = distancias.includes(pedidaD) ? pedidaD : distancias[0];
  const serie = distancia ? serieSplit(filas, distancia) : [];
  const semanas = volumenSemanal(filas);
  const qAtleta = esRemero ? "" : `atleta=${atletaId}&`;
  const elegido = atletas.find((a) => a.id === atletaId);
  const nombreAtleta = elegido ?? { nombre: usuario.nombre, apellido: "" };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-7 px-6 py-8 text-lg">
      <div className="flex items-center gap-4">
        <AvatarAnillo nombre={nombreAtleta.nombre} apellido={nombreAtleta.apellido} tam={56} />
        <div className="leading-tight">
          <p className="text-sm font-semibold uppercase tracking-wider text-mar-700">Progreso</p>
          <h1 className="text-2xl font-semibold text-zinc-900">{`${nombreAtleta.nombre} ${nombreAtleta.apellido}`.trim()}</h1>
        </div>
      </div>

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

      {sinVerificar > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-base text-amber-900">
          {sinVerificar === 1 ? "1 sesión sin verificar no cuenta" : `${sinVerificar} sesiones sin verificar no cuentan`} en
          récords ni gráficos.{" "}
          <Link href={`/sesiones?${qAtleta}`} className="font-semibold underline">Revisarlas</Link>
        </p>
      )}

      {!resumen.hayDatos ? (
        <section className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-5">
          <p className="font-semibold">Todavía no hay sesiones verificadas.</p>
          <p className="text-base text-zinc-700">
            Cuando se carguen sesiones (y las leídas de foto se confirmen), aquí aparecen los récords y las curvas.
          </p>
          <Link href="/sesion/nueva" className="flex h-14 items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white">
            Cargar una sesión
          </Link>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-100 p-4">
              <p className="text-sm text-zinc-600">Sesiones verificadas</p>
              <p className="text-2xl font-semibold">{resumen.sesiones}</p>
            </div>
            <div className="rounded-xl bg-zinc-100 p-4">
              <p className="text-sm text-zinc-600">Distancia total</p>
              <p className="text-2xl font-semibold">{kilometros(resumen.metros)}</p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="border-b-2 border-mar-500 pb-1 text-xl font-semibold">Récords personales</h2>
            {records.length === 0 ? (
              <p className="text-base text-zinc-600">Los récords salen de sesiones en ergómetro con distancia y tiempo.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-200">
                {records.map((r) => (
                  <li key={r.distancia_m} className="cifras flex items-stretch gap-3 py-3">
                    <span aria-hidden className="w-1 shrink-0 rounded-sm bg-pala-600" />
                    <div className="flex-1">
                      <p className="font-semibold">{nombreDistancia(r.distancia_m)}</p>
                      <p className="text-sm text-zinc-600">
                        {TIPOS[r.tipo] ?? r.tipo} · {fechaLarga(r.fecha)}
                        {r.sesiones > 1 ? ` · ${r.sesiones} sesiones` : ""}
                      </p>
                    </div>
                    <div className="self-center text-right">
                      <p className="text-xl font-semibold">{formatTiempo(r.tiempo_ds)}</p>
                      <p className="text-sm text-zinc-600">
                        {formatTiempo(r.split500_ds)} /500 · {r.watts} W{r.spm !== null ? ` · ${r.spm} spm` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="border-b-2 border-mar-500 pb-1 text-xl font-semibold">Split por distancia</h2>
            {distancia === undefined ? (
              <p className="text-base text-zinc-600">
                La curva aparece cuando hay al menos dos sesiones verificadas en la misma distancia.
              </p>
            ) : (
              <>
                {distancias.length > 1 && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Distancia">
                    {distancias.map((d) => (
                      <Link key={d} href={`/progreso?${qAtleta}d=${d}`} className={chip(d === distancia)} scroll={false}>
                        {nombreDistancia(d)}
                      </Link>
                    ))}
                  </div>
                )}
                <CurvaSplit key={`${atletaId}-${distancia}`} puntos={serie} titulo={`Split /500 m en ${nombreDistancia(distancia)}`} />
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="border-b-2 border-mar-500 pb-1 text-xl font-semibold">Volumen semanal</h2>
            <BarrasVolumen key={atletaId} semanas={semanas} titulo="Distancia por semana, últimas 12 semanas" />
          </section>
        </>
      )}

      <Link href="/" className="pt-2 text-zinc-700 underline">Volver al inicio</Link>
    </main>
  );
}
