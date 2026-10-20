import { z } from "zod";
import { obtenerAcceso } from "@/lib/acceso/actual";
import { atletaVisible } from "@/lib/atletas/administrar";
import { exportarAtleta } from "@/lib/atletas/exportar";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Descarga todos los datos de un atleta como JSON. Entrenador del atleta o admin.
export async function GET(_req: Request, ctx: RouteContext<"/atletas/[id]/exportar">): Promise<Response> {
  const acceso = await obtenerAcceso();
  if (acceso.estado !== "ok") return new Response("No autorizado", { status: 401 });
  if (acceso.usuario.rol === "remero") return new Response("Sin permiso", { status: 403 });

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return new Response("Atleta no válido", { status: 400 });

  // RLS decide si este usuario ve al atleta; el 403 no distingue "no existe" de "no es tuyo".
  const supabase = await crearClienteServidor();
  if (!(await atletaVisible(supabase, id.data))) return new Response("Sin permiso", { status: 403 });

  const datos = await exportarAtleta(crearClienteAdmin(), id.data);
  await supabase.rpc("registrar_acceso", { p_atleta_id: id.data, p_accion: "exportar", p_detalle: null });

  return new Response(JSON.stringify(datos, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="atleta-${id.data}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
