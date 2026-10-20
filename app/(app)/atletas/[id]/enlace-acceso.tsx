"use client";

import { useState, useTransition } from "react";
import { generarEnlaceAccion } from "./actions";

export function EnlaceAcceso({ atletaId, nombre }: { atletaId: string; nombre: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [pendiente, empezar] = useTransition();

  const generar = () => {
    setError("");
    setAviso("");
    empezar(async () => {
      const r = await generarEnlaceAccion(atletaId);
      if ("error" in r) setError(r.error);
      else setUrl(r.url);
    });
  };

  const compartir = async () => {
    const texto = `Enlace para entrar a Regatapp (${nombre}). Vale 24 horas y se usa una sola vez.`;
    try {
      if (navigator.share) await navigator.share({ title: "Regatapp", text: texto, url });
      else {
        await navigator.clipboard.writeText(url);
        setAviso("Enlace copiado");
      }
    } catch {
      // El usuario canceló el menú de compartir.
    }
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
        <>
          <p className="break-all rounded-lg bg-zinc-100 p-3 text-sm">{url}</p>
          <button type="button" onClick={compartir} className="h-14 w-full rounded-xl bg-zinc-200 text-lg font-semibold">
            Compartir
          </button>
          {aviso && <p role="status" className="text-base text-green-800">{aviso}</p>}
        </>
      )}
    </div>
  );
}
