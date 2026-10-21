import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { eliminarAtleta } from "../lib/atletas/eliminar";
import { ATLETAS_PRUEBA, generarSesionesPrueba } from "../lib/datos-prueba";
import { hoySantiago } from "../lib/schemas/consentimiento";
import { entorno, esEntornoLocal, fallar, mensajeDe } from "./comun";

const USO =
  "Uso: npm run datos-prueba            carga 2 atletas de ejemplo con sus sesiones\n" +
  "     npm run datos-prueba -- --borrar  borra todo lo de prueba (apellido que empieza con PRUEBA)\n" +
  "Es idempotente: no duplica a los atletas que ya existen.";

let valores;
try {
  ({ values: valores } = parseArgs({ options: { borrar: { type: "boolean" } }, strict: true, allowPositionals: false }));
} catch (e) {
  fallar(`${mensajeDe(e)}\n${USO}`);
}

async function main(borrar: boolean): Promise<void> {
  const { admin } = entorno();
  const local = esEntornoLocal([["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL]]);
  if (!local.ok && process.env.CONFIRMAR_PRODUCCION !== "1") {
    fallar("Esto escribe en una base remota. Si es intencional, define CONFIRMAR_PRODUCCION=1.");
  }

  if (borrar) {
    const { data: atletas, error } = await admin.from("atleta").select("id, apellido").like("apellido", "PRUEBA%");
    if (error) fallar(`Error: ${error.message}`);
    const { data: admins } = await admin.from("perfil").select("user_id").eq("rol", "admin").limit(1);
    const ejecutor = admins?.[0]?.user_id as string | undefined;
    if (!ejecutor) fallar("No hay un admin que figure como quien ejecuta el borrado.");
    for (const a of atletas ?? []) {
      await eliminarAtleta(admin, a.id as string, ejecutor);
      console.error(`Borrado: ${a.apellido}`);
    }
    console.error(`Listo: ${atletas?.length ?? 0} atletas de prueba borrados.`);
    return;
  }

  for (const def of ATLETAS_PRUEBA) {
    const { data: existe } = await admin.from("atleta").select("id").eq("apellido", def.apellido).maybeSingle();
    if (existe) {
      console.error(`Ya existe: ${def.nombre} ${def.apellido} (se deja como está)`);
      continue;
    }
    const { semilla, perfil, ...datos } = def;
    const { data: atleta, error } = await admin.from("atleta").insert(datos as Record<string, unknown>).select("id").single();
    if (error || !atleta) fallar(`Error creando a ${def.nombre}: ${error?.message}`);
    const atletaId = atleta.id as string;
    try {
      const { error: errCons } = await admin.from("consentimiento").insert({
        atleta_id: atletaId,
        otorgado_por_nombre: "Apoderado de prueba",
        relacion: "apoderado",
        medio: "digital",
        version_texto: "v0-pruebas",
        otorgado_en: hoySantiago(),
      });
      if (errCons) throw new Error(errCons.message);

      const sesiones = generarSesionesPrueba(semilla, perfil, new Date());
      const filas = sesiones.map((s) => ({ id: randomUUID(), atleta_id: atletaId, ...s.sesion }));
      const { error: errSes } = await admin.from("sesion").insert(filas);
      if (errSes) throw new Error(errSes.message);
      const splits = sesiones.flatMap((s, i) => s.splits.map((x) => ({ sesion_id: filas[i].id, ...x })));
      const { error: errSplit } = await admin.from("split").insert(splits);
      if (errSplit) throw new Error(errSplit.message);
      console.error(`Creado: ${def.nombre} ${def.apellido} con ${filas.length} sesiones (${filas.filter((f) => !f.verificado).length} sin verificar)`);
    } catch (e) {
      // No dejar un atleta a medias: se borra (en cascada sesiones y consentimiento).
      await admin.from("atleta").delete().eq("id", atletaId);
      fallar(`Error cargando a ${def.nombre}; se deshizo: ${mensajeDe(e)}`);
    }
  }
}

void main(Boolean(valores.borrar)).catch((e) => fallar(`Error: ${mensajeDe(e)}`));
