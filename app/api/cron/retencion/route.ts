import { timingSafeEqual } from "node:crypto";
import { borrarFotosVencidas } from "@/lib/ocr/retencion";
import { crearClienteAdmin } from "@/lib/supabase/admin";

function esValido(recibido: string | null, secreto: string): boolean {
  const a = Buffer.from(recibido ?? "");
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cron diario de Vercel (vercel.json): borra las fotos que llevan más de 7 días
 * sin confirmarse (diseño §5.4). Vercel manda `Authorization: Bearer $CRON_SECRET`.
 * Sin CRON_SECRET configurado la ruta queda cerrada.
 */
export async function GET(req: Request): Promise<Response> {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || !esValido(req.headers.get("authorization"), secreto)) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    const borradas = await borrarFotosVencidas(crearClienteAdmin());
    return Response.json({ borradas });
  } catch {
    return new Response("Error al borrar fotos", { status: 500 });
  }
}
