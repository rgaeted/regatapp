"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirUsuario } from "@/lib/acceso/actual";
import { COOKIE_ULTIMO_ATLETA } from "@/lib/atletas/lista";
import { armarSesionInput } from "@/lib/sesion/formulario";
import { guardarSesion } from "@/lib/sesion/guardar";
import { crearClienteServidor } from "@/lib/supabase/server";

// La acción recibe un objeto del cliente: se valida la forma antes de usarlo.
const estadoSchema = z.object({
  id: z.string(),
  atletaId: z.string(),
  tipo: z.enum(["entrenamiento", "test", "competencia"]),
  modalidad: z.enum(["ergometro", "agua", "gimnasio", "otro"]),
  fecha: z.string(),
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

export async function guardarSesionAccion(crudo: unknown): Promise<{ error: string }> {
  const usuario = await requerirUsuario();
  const estado = estadoSchema.safeParse(crudo);
  if (!estado.success) return { error: "Revisa los datos de la sesión." };

  // Un remero solo carga para sí mismo; RLS lo exige igual, esto da el mensaje.
  if (usuario.rol === "remero" && estado.data.atletaId !== usuario.atletaId) {
    return { error: "Solo puedes cargar tus propias sesiones." };
  }

  const armado = armarSesionInput(estado.data);
  if (!armado.ok) return { error: Object.values(armado.errores)[0] ?? "Revisa los datos de la sesión." };

  const supabase = await crearClienteServidor();
  const r = await guardarSesion(supabase, armado.input);
  if (!r.ok) return { error: r.error };

  (await cookies()).set(COOKIE_ULTIMO_ATLETA, armado.input.atleta_id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  redirect(`/sesiones?guardada=1&atleta=${armado.input.atleta_id}`);
}
