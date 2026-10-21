"use client";

import { useActionState, useState, useTransition } from "react";
import { CompartirUrl } from "@/components/compartir-url";
import {
  crearEntrenadorAccion,
  fijarClaveEntrenadorAccion,
  regenerarEnlaceEntrenadorAccion,
  type EstadoClave,
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
      <fieldset className="flex flex-col gap-3 rounded-xl border border-zinc-300 p-4">
        <legend className="px-2 text-base font-semibold">Usuario y contraseña (opcional)</legend>
        <p className="text-sm text-zinc-600">Si los dejas vacíos, solo se genera un enlace de acceso.</p>
        <input
          name="usuario"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Usuario"
          aria-label="Usuario"
          className={campo}
        />
        <input name="clave" type="password" autoComplete="new-password" placeholder="Contraseña (mínimo 8)" aria-label="Contraseña" className={campo} />
      </fieldset>
      <button
        type="submit"
        disabled={pendiente}
        className="h-16 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Creando…" : "Crear entrenador"}
      </button>
      {estado.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
      {estado.usuario && (
        <p role="status" className="rounded-lg bg-mar-100 px-3 py-2 text-base text-zinc-900">
          Entra en la pantalla de entrada con el usuario <strong className="cifras">{estado.usuario}</strong> y la contraseña que
          escribiste. El enlace de abajo es otra forma de entrar.
        </p>
      )}
      {estado.url && (
        <CompartirUrl url={estado.url} texto={`Enlace para entrar a Regatapp (${estado.nombre}). Vale 24 horas y se usa una sola vez.`} />
      )}
    </form>
  );
}

/** Usuario y contraseña de un entrenador existente: fijarlos por primera vez o cambiarlos. */
export function ClaveEntrenador({ usuarioId, usuarioActual }: { usuarioId: string; usuarioActual: string | null }) {
  const [estado, accion, pendiente] = useActionState<EstadoClave, FormData>(fijarClaveEntrenadorAccion, {});
  return (
    <details className="rounded-xl border border-zinc-300 p-3">
      <summary className="cursor-pointer text-base font-medium">
        {usuarioActual ? `Usuario: ${usuarioActual} · cambiar contraseña` : "Fijar usuario y contraseña"}
      </summary>
      <form action={accion} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="id" value={usuarioId} />
        <input
          name="usuario"
          required
          defaultValue={usuarioActual ?? ""}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Usuario"
          placeholder="Usuario"
          className={campo}
        />
        <input name="clave" type="password" required autoComplete="new-password" aria-label="Contraseña nueva" placeholder="Contraseña nueva (mínimo 8)" className={campo} />
        {estado.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
        {estado.ok && <p role="status" className="text-base text-green-800">{estado.ok}</p>}
        <button type="submit" disabled={pendiente} className="h-14 w-full rounded-xl bg-zinc-900 text-lg font-semibold text-white disabled:opacity-50">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </details>
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
