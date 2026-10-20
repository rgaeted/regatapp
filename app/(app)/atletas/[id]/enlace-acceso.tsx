"use client";

import { useState, useTransition } from "react";
import { CompartirUrl } from "@/components/compartir-url";
import { generarEnlaceAccion } from "./actions";

export function EnlaceAcceso({ atletaId, nombre }: { atletaId: string; nombre: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();

  const generar = () => {
    setError("");
    empezar(async () => {
      const r = await generarEnlaceAccion(atletaId);
      if ("error" in r) setError(r.error);
      else setUrl(r.url);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={generar}
        disabled={pendiente}
        className="h-16 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Generando…" : "Generar enlace de acceso"}
      </button>
      {error && <p role="alert" className="text-base font-medium text-red-700">{error}</p>}
      {url && (
        <CompartirUrl url={url} texto={`Enlace para entrar a Regatapp (${nombre}). Vale 24 horas y se usa una sola vez.`} />
      )}
    </div>
  );
}
