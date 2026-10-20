"use client";

import { useActionState, useState, useTransition } from "react";
import { CompartirUrl } from "@/components/compartir-url";
import {
  crearEntrenadorAccion,
  regenerarEnlaceEntrenadorAccion,
  type EstadoEntrenador,
} from "./actions";

const campo = "h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-lg";

export function FormularioEntrenador() {
  const [estado, accion, pendiente] = useActionState<EstadoEntrenador, FormData>(crearEntrenadorAccion, {});
  return (
    <form action={accion} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-base font-medium text-zinc-700">
        Nombre del entrenador
        <input name="nombre" required autoComplete="off" className={campo} />
      </label>
      <button
        type="submit"
        disabled={pendiente}
        className="h-16 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Creando…" : "Crear entrenador y generar enlace"}
      </button>
      {estado.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
      {estado.url && (
        <CompartirUrl url={estado.url} texto={`Enlace para entrar a Regatapp (${estado.nombre}). Vale 24 horas y se usa una sola vez.`} />
      )}
    </form>
  );
}

export function EnlaceEntrenador({ usuarioId, nombre }: { usuarioId: string; nombre: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            setError("");
            const r = await regenerarEnlaceEntrenadorAccion(usuarioId);
            if ("error" in r) setError(r.error);
            else setUrl(r.url);
          })
        }
        className="h-14 w-full rounded-xl bg-zinc-200 text-lg font-semibold disabled:opacity-50"
      >
        {pendiente ? "Generando…" : "Nuevo enlace de acceso"}
      </button>
      {error && <p role="alert" className="text-base font-medium text-red-700">{error}</p>}
      {url && <CompartirUrl url={url} texto={`Enlace para entrar a Regatapp (${nombre}). Vale 24 horas y se usa una sola vez.`} />}
    </div>
  );
}
