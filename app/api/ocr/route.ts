import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { obtenerAcceso } from "@/lib/acceso/actual";
import { LIMITE_DIARIO, ocrDisponible } from "@/lib/ocr/disponible";
import { rutaCapturaValida, tipoDeRuta } from "@/lib/ocr/imagen";
import { leerFoto } from "@/lib/ocr/leer";
import { crearClienteServidor } from "@/lib/supabase/server";

// La lectura puede tardar; sin esto Vercel corta a los pocos segundos.
export const maxDuration = 60;

// Límite de la API para una imagen: 5 MB. La app reduce la foto antes de subirla.
const MAX_BYTES = 4_500_000;

const cuerpoSchema = z.object({ path: z.string().min(1).max(200) });

export type RespuestaOcr =
  | { capturaId: string; estado: "leida" | "vacia" }
  | { capturaId: string | null; estado: "fallo"; motivo: "sin_configurar" | "imagen" | "ilegible" | "error" | "limite" };

/**
 * Lee una foto ya subida a Storage. Nunca devuelve un error técnico a la
 * persona: si el modelo no puede leerla, responde `estado: "fallo"` y la
 * pantalla sigue con el formulario manual. La API key vive solo en el servidor.
 *
 * Idempotente por foto: repetir la llamada con la misma ruta reutiliza la
 * captura (y su lectura, si ya existe) en vez de crear otra o pagar de nuevo.
 */
export async function POST(req: Request): Promise<Response> {
  const acceso = await obtenerAcceso();
  if (acceso.estado !== "ok") return new Response("No autorizado", { status: 401 });
  const usuario = acceso.usuario;

  const cuerpo = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success || !rutaCapturaValida(cuerpo.data.path, usuario.id)) {
    return new Response("Ruta de foto no válida", { status: 400 });
  }
  const path = cuerpo.data.path;
  const supabase = await crearClienteServidor();
  // Sin clave no hay nada que leer: antes de crear la captura, que no deja filas inútiles.
  if (!ocrDisponible()) return Response.json({ capturaId: null, estado: "fallo", motivo: "sin_configurar" } satisfies RespuestaOcr);

  // Captura existente de esta foto (reintento / doble toque).
  const { data: previa, error: errPrevia } = await supabase
    .from("captura")
    .select("id, respuesta_cruda")
    .eq("storage_path", path)
    .eq("subida_por", usuario.id)
    .maybeSingle();
  if (errPrevia) return Response.json({ capturaId: null, estado: "fallo", motivo: "error" } satisfies RespuestaOcr);
  if (previa?.respuesta_cruda) {
    return Response.json({ capturaId: previa.id, estado: "leida" } satisfies RespuestaOcr);
  }

  // Tope de fotos por usuario y día (cada lectura es una llamada de pago). Cuenta las capturas
  // creadas en las últimas 24 h, incluida esta (la app la crea antes de subir la foto).
  {
    const desde = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabase
      .from("captura")
      .select("id", { count: "exact", head: true })
      .eq("subida_por", usuario.id)
      .gte("subida_en", desde);
    if ((count ?? 0) > LIMITE_DIARIO) {
      return Response.json({ capturaId: null, estado: "fallo", motivo: "limite" } satisfies RespuestaOcr);
    }
  }

  let capturaId = previa?.id as string | undefined;
  if (!capturaId) {
    const { data: nueva, error } = await supabase
      .from("captura")
      .insert({ storage_path: path, subida_por: usuario.id })
      .select("id")
      .single();
    if (error || !nueva) return Response.json({ capturaId: null, estado: "fallo", motivo: "error" } satisfies RespuestaOcr);
    capturaId = nueva.id as string;
  }
  const fallo = (motivo: "sin_configurar" | "imagen" | "ilegible" | "error"): Response =>
    Response.json({ capturaId, estado: "fallo", motivo } satisfies RespuestaOcr);

  const { data: blob, error: errBajada } = await supabase.storage.from("capturas").download(path);
  if (errBajada || !blob) return fallo("imagen");
  if (blob.size > MAX_BYTES) return fallo("imagen");
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  const modelo = process.env.OCR_MODEL || "claude-sonnet-5-5";
  // Un solo reintento y 40 s: la persona espera con el celular en la mano.
  const cliente = new Anthropic({ timeout: 40_000, maxRetries: 1 });
  const r = await leerFoto((p) => cliente.messages.parse(p), { base64, mediaType: tipoDeRuta(path) }, modelo);
  if (!r.ok) return fallo(r.motivo === "ilegible" ? "ilegible" : "error");

  const { error: errGuardar } = await supabase
    .from("captura")
    .update({ modelo, respuesta_cruda: r.cruda, confianza: r.lectura.confianza })
    .eq("id", capturaId);
  if (errGuardar) return fallo("error");

  return Response.json({ capturaId, estado: r.vacia ? "vacia" : "leida" } satisfies RespuestaOcr);
}
