"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirUsuario } from "@/lib/acceso/actual";
import { COOKIE_ULTIMO_ATLETA } from "@/lib/atletas/lista";
import { huboCambios, lecturaAEstado, lecturaModeloSchema, normalizarLectura } from "@/lib/ocr/lectura";
import { borrarFoto } from "@/lib/ocr/retencion";
import { armarSesionInput, estadoInicial } from "@/lib/sesion/formulario";
import { guardarSesion, type OrigenFoto } from "@/lib/sesion/guardar";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// La acción recibe un objeto del cliente: se valida la forma antes de usarlo.
const estadoSchema = z.object({
  id: z.string(),
  atletaId: z.string(),
  tipo: z.enum(["entrenamiento", "test", "competencia"]),
  modalidad: z.enum(["ergometro", "agua", "gimnasio", "otro"]),
  fecha: z.string(),
  dia: z.string(),
  distancia: z.string(),
  tiempoDigitos: z.string(),
  nSplits: z.number().int().min(0).max(50),
  splitsDigitos: z.array(z.string()).max(50),
  extras: z.object({
    spm: z.string(),
    fcPromedio: z.string(),
    fcMaxima: z.string(),
    calorias: z.string(),
    drag: z.string(),
    rpe: z.string(),
    descripcion: z.string(),
    notas: z.string(),
  }),
});

const fotoSchema = z.object({ capturaId: z.uuid(), sinRevisar: z.boolean() }).nullable();

export async function guardarSesionAccion(crudo: unknown, fotoCruda: unknown = null): Promise<{ error: string }> {
  const usuario = await requerirUsuario();
  const estado = estadoSchema.safeParse(crudo);
  const foto = fotoSchema.safeParse(fotoCruda ?? null);
  if (!estado.success || !foto.success) return { error: "Revisa los datos de la sesión." };

  // Un remero solo carga para sí mismo; RLS lo exige igual, esto da el mensaje.
  if (usuario.rol === "remero" && estado.data.atletaId !== usuario.atletaId) {
    return { error: "Solo puedes cargar tus propias sesiones." };
  }

  const armado = armarSesionInput(estado.data);
  if (!armado.ok) return { error: Object.values(armado.errores)[0] ?? "Revisa los datos de la sesión." };

  const supabase = await crearClienteServidor();

  // Sesión desde una foto: la captura debe ser del usuario (RLS) y es el
  // servidor quien decide si hubo correcciones, comparando con lo que leyó el modelo.
  let origen: OrigenFoto | undefined;
  if (foto.data) {
    const { data: captura, error } = await supabase
      .from("captura")
      .select("respuesta_cruda")
      .eq("id", foto.data.capturaId)
      .maybeSingle();
    if (error || !captura) return { error: "No se encontró la foto. Vuelve a cargarla." };
    const cruda = lecturaModeloSchema.safeParse(captura.respuesta_cruda);
    const base = estadoInicial(estado.data.id, estado.data.atletaId, new Date());
    // Sin lectura (el modelo falló) todo lo del formulario lo tipeó la persona.
    const editado = cruda.success
      ? huboCambios(lecturaAEstado(normalizarLectura(cruda.data), base), estado.data as typeof base)
      : true;
    origen = { captura_id: foto.data.capturaId, verificado: !foto.data.sinRevisar, editado_manual: editado };
  }

  const r = await guardarSesion(supabase, armado.input, origen);
  if (!r.ok) return { error: r.error };

  // Confirmada: la foto ya no se necesita (retención, diseño §5.4). Si falla, el
  // cron diario la limpia; la sesión ya está guardada.
  if (origen?.verificado) {
    try {
      await borrarFoto(crearClienteAdmin(), origen.captura_id);
    } catch {
      /* lo repite el cron de retención */
    }
  }

  (await cookies()).set(COOKIE_ULTIMO_ATLETA, armado.input.atleta_id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  redirect(`/sesiones?guardada=1&atleta=${armado.input.atleta_id}`);
}
