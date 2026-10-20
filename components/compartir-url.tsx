"use client";

import { useState } from "react";

/** Muestra un enlace de acceso y lo comparte (menú del celular) o lo copia. */
export function CompartirUrl({ url, texto }: { url: string; texto: string }) {
  const [aviso, setAviso] = useState("");

  const compartir = async () => {
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
      <p className="break-all rounded-lg bg-zinc-100 p-3 text-sm">{url}</p>
      <button type="button" onClick={compartir} className="h-14 w-full rounded-xl bg-zinc-200 text-lg font-semibold">
        Compartir
      </button>
      {aviso && <p role="status" className="text-base text-green-800">{aviso}</p>}
    </div>
  );
}
