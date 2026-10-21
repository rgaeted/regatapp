"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirUsuario } from "@/lib/acceso/actual";
import { borrarFoto } from "@/lib/ocr/retencion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

const idSchema = z.object({ id: z.uuid(), atleta: z.uuid() });

/**
 * Confirma una sesión leída de una foto que se guardó "sin revisar". RLS decide
 * quién puede tocarla; solo cambia `verificado`. Al confirmar, la foto se borra.
 */
export async function verificarSesionAccion(fd: FormData): Promise<void> {
  await requerirUsuario();
  const p = idSchema.safeParse({ id: fd.get("id"), atleta: fd.get("atleta") });
  if (!p.success) redirect("/sesiones");

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("sesion")
    .update({ verificado: true })
    .eq("id", p.data.id)
    .eq("verificado", false)
    .select("captura_id");
  const captura = data?.[0]?.captura_id as string | null | undefined;
  if (captura) {
    try {
      await borrarFoto(crearClienteAdmin(), captura);
    } catch {
      /* lo repite el cron de retención */
    }
  }
  redirect(`/sesiones?atleta=${p.data.atleta}`);
}
