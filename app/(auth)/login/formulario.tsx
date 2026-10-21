"use client";

import { useActionState } from "react";
import { iniciarSesionAccion, type EstadoLogin } from "./actions";

const campo = "h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-lg";

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesionAccion, {});
  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-base font-medium text-zinc-700">
        Usuario
        <input
          name="usuario"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={estado.usuario}
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1 text-base font-medium text-zinc-700">
        Contraseña
        <input name="clave" type="password" required autoComplete="current-password" className={campo} />
      </label>
      {estado.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="h-16 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
