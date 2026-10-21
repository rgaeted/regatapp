"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { escalarA } from "@/lib/ocr/imagen";
import { crearClienteNavegador } from "@/lib/supabase/browser";
import type { RespuestaOcr } from "@/app/api/ocr/route";

const LADO_MAYOR = 1600;
const MENSAJES: Record<string, string> = {
  sin_configurar: "La lectura automática todavía no está activada. Carga los datos a mano.",
  imagen: "No se pudo procesar la foto. Prueba con otra o carga a mano.",
  ilegible: "No se pudo leer la pantalla. Prueba con otra foto o carga a mano.",
  error: "No se pudo leer la foto ahora. Reintenta o carga a mano.",
  limite: "Llegaste al máximo de fotos de hoy. Carga los datos a mano.",
};

/** Reduce la foto del celular: sube más rápido y la lectura cuesta menos. */
async function reducir(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const { ancho, alto } = escalarA(bitmap.width, bitmap.height, LADO_MAYOR);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("no se pudo reducir la imagen");
  return blob;
}

export function CamaraOcr({ usuarioId }: { usuarioId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  // La ruta subida se conserva para reintentar la lectura sin volver a subir.
  const ruta = useRef<string | null>(null);
  const [trabajando, setTrabajando] = useState("");
  const [error, setError] = useState("");

  const leer = async (path: string) => {
    setTrabajando("Leyendo la pantalla…");
    const r = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!r.ok) throw new Error("ocr");
    const datos = (await r.json()) as RespuestaOcr;
    if (datos.estado === "fallo") {
      if (datos.motivo === "sin_configurar" || datos.motivo === "imagen" || datos.motivo === "limite") {
        // No hay nada que reintentar: directo al formulario manual.
        router.push(datos.capturaId ? `/sesion/nueva?captura=${datos.capturaId}&aviso=${datos.motivo}` : `/sesion/nueva?aviso=${datos.motivo}`);
        return;
      }
      setError(MENSAJES[datos.motivo] ?? MENSAJES.error);
      setTrabajando("");
      return;
    }
    router.push(`/sesion/nueva?captura=${datos.capturaId}${datos.estado === "vacia" ? "&aviso=vacia" : ""}`);
  };

  const alElegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError("");
    try {
      setTrabajando("Preparando la foto…");
      const imagen = await reducir(archivo);
      const path = `${usuarioId}/${crypto.randomUUID()}.jpg`;
      setTrabajando("Subiendo…");
      const supabase = crearClienteNavegador();
      // Primero la fila: así el cron de retención encuentra (y borra) la foto aunque la app se cierre a mitad.
      const { error: errFila } = await supabase.from("captura").insert({ storage_path: path, subida_por: usuarioId });
      if (errFila) throw new Error("fila");
      const { error: errSubida } = await supabase.storage.from("capturas").upload(path, imagen, { contentType: "image/jpeg" });
      if (errSubida) throw new Error("subida");
      ruta.current = path;
      await leer(path);
    } catch {
      setError("No se pudo subir la foto. Revisa tu conexión y reintenta, o carga a mano.");
      setTrabajando("");
    }
  };

  const reintentar = async () => {
    setError("");
    if (!ruta.current) return entrada.current?.click();
    try {
      await leer(ruta.current);
    } catch {
      setError(MENSAJES.error);
      setTrabajando("");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void alElegir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={trabajando !== ""}
        onClick={() => entrada.current?.click()}
        className="h-20 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
      >
        {trabajando || "Sacar o elegir foto"}
      </button>
      {error && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-base font-medium text-red-700">{error}</p>
          <button type="button" onClick={() => void reintentar()} className="h-14 w-full rounded-xl bg-zinc-200 text-lg font-semibold">
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
