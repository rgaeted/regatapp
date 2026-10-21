import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requerirStaff } from "@/lib/acceso/staff";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cambiarActivoAccion, editarAtletaAccion, eliminarAtletaAccion, revocarConsentimientoAccion } from "./actions";
import { EnlaceAcceso } from "./enlace-acceso";

const campo = "h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-lg";
const etiqueta = "flex flex-col gap-1 text-base font-medium text-zinc-700";
const botonSecundario = "h-14 w-full rounded-xl bg-zinc-200 text-lg font-semibold text-zinc-900";

export default async function FichaAtleta({ params, searchParams }: PageProps<"/atletas/[id]">) {
  const usuario = await requerirStaff();
  const { id: crudo } = await params;
  const id = z.uuid().safeParse(crudo);
  if (!id.success) notFound();
  const sp = await searchParams;

  const supabase = await crearClienteServidor();
  const { data: atleta, error } = await supabase.from("atleta").select("*").eq("id", id.data).maybeSingle();
  if (error) throw new Error(`atleta: ${error.message}`);
  if (!atleta) notFound();

  const { data: consentimientos } = await supabase
    .from("consentimiento")
    .select("otorgado_por_nombre, relacion, medio, version_texto, otorgado_en, revocado_en")
    .eq("atleta_id", id.data)
    .order("creado_en", { ascending: false })
    .limit(1);
  const consentimiento = consentimientos?.[0];
  const vigente = consentimiento && !consentimiento.revocado_en;

  // Un tercero que abre la ficha de un atleta queda registrado (diseño §5.2).
  await supabase.rpc("registrar_acceso", { p_atleta_id: id.data, p_accion: "ver_ficha", p_detalle: null });

  const nombre = `${atleta.nombre} ${atleta.apellido}`;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">{nombre}</h1>
      {typeof sp.e === "string" && <p role="alert" className="font-medium text-red-700">{sp.e}</p>}

      <section className="flex flex-col gap-1 rounded-xl bg-zinc-100 p-4 text-base">
        <p>
          Estado: <strong>{atleta.activo ? "Activo" : "Inactivo"}</strong>
        </p>
        {consentimiento ? (
          <p>
            Consentimiento: <strong>{vigente ? "vigente" : "revocado — acceso bloqueado"}</strong>
            <br />
            Otorgado por {consentimiento.otorgado_por_nombre} ({consentimiento.relacion}), {consentimiento.medio},
            {" "}{consentimiento.otorgado_en}, texto {consentimiento.version_texto}.
          </p>
        ) : (
          <p className="font-medium text-red-700">Sin consentimiento registrado.</p>
        )}
      </section>

      <Link
        href={`/sesiones?atleta=${atleta.id}`}
        className="flex h-16 items-center justify-center rounded-xl bg-zinc-900 text-xl font-semibold text-white"
      >
        Ver sesiones
      </Link>
      <Link href={`/progreso?atleta=${atleta.id}`} className="flex h-14 items-center justify-center rounded-xl bg-zinc-200 text-lg font-semibold text-zinc-900">
        Ver progreso
      </Link>

      {vigente && atleta.activo && <EnlaceAcceso atletaId={atleta.id} nombre={nombre} />}

      <details className="rounded-xl border border-zinc-300 p-4">
        <summary className="cursor-pointer text-lg font-medium">Editar datos</summary>
        <form action={editarAtletaAccion} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={atleta.id} />
          <label className={etiqueta}>Nombre
            <input name="nombre" required className={campo} defaultValue={atleta.nombre} />
          </label>
          <label className={etiqueta}>Apellido
            <input name="apellido" required className={campo} defaultValue={atleta.apellido} />
          </label>
          <label className={etiqueta}>Fecha de nacimiento
            <input name="fecha_nacimiento" type="date" className={campo} defaultValue={atleta.fecha_nacimiento ?? ""} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={etiqueta}>Peso (kg)
              <input name="peso_kg" inputMode="decimal" className={campo} defaultValue={atleta.peso_kg ?? ""} />
            </label>
            <label className={etiqueta}>Altura (cm)
              <input name="altura_cm" inputMode="numeric" className={campo} defaultValue={atleta.altura_cm ?? ""} />
            </label>
            <label className={etiqueta}>Sexo
              <select name="sexo" className={campo} defaultValue={atleta.sexo ?? ""}>
                <option value="">—</option>
                <option value="F">F</option>
                <option value="M">M</option>
                <option value="X">X</option>
              </select>
            </label>
            <label className={etiqueta}>Categoría
              <select name="categoria_peso" className={campo} defaultValue={atleta.categoria_peso ?? ""}>
                <option value="">—</option>
                <option value="ligero">Ligero</option>
                <option value="abierto">Abierto</option>
              </select>
            </label>
          </div>
          <button type="submit" className="h-14 w-full rounded-xl bg-zinc-900 text-lg font-semibold text-white">
            Guardar cambios
          </button>
        </form>
      </details>

      <form action={cambiarActivoAccion}>
        <input type="hidden" name="id" value={atleta.id} />
        <input type="hidden" name="activo" value={atleta.activo ? "0" : "1"} />
        <button type="submit" className={botonSecundario}>
          {atleta.activo ? "Desactivar atleta" : "Reactivar atleta"}
        </button>
      </form>

      {vigente && (
        <form action={revocarConsentimientoAccion}>
          <input type="hidden" name="id" value={atleta.id} />
          <button type="submit" className="h-14 w-full rounded-xl border-2 border-red-700 text-lg font-semibold text-red-700">
            Revocar consentimiento
          </button>
          <p className="mt-2 text-sm text-zinc-600">
            Bloquea el acceso del atleta y la carga de sesiones nuevas. No borra sus datos.
          </p>
        </form>
      )}

      <a href={`/atletas/${atleta.id}/exportar`} download className={`${botonSecundario} flex items-center justify-center`}>
        Exportar todos sus datos
      </a>

      {usuario.rol === "admin" && (
        <details className="rounded-xl border-2 border-red-700 p-4">
          <summary className="cursor-pointer text-lg font-semibold text-red-700">Eliminar todos sus datos</summary>
          <form action={eliminarAtletaAccion} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="id" value={atleta.id} />
            <p className="text-base">
              Borra al atleta, sus sesiones, consentimientos, fotos y su cuenta. No se puede deshacer. Escribe el
              apellido <strong>{atleta.apellido}</strong> para confirmar.
            </p>
            <input name="confirmacion" required autoComplete="off" className={campo} />
            <button type="submit" className="h-14 w-full rounded-xl bg-red-700 text-lg font-semibold text-white">
              Eliminar definitivamente
            </button>
          </form>
        </details>
      )}

      <Link href="/atletas" className="pt-2 text-zinc-700 underline">Volver a atletas</Link>
    </main>
  );
}
