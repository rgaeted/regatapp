"use client";

import { useActionState } from "react";
import { registrarseAccion, type EstadoRegistro } from "./actions";

const campo = "h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-lg";

export function FormularioRegistro() {
  const [estado, accion, pendiente] = useActionState<EstadoRegistro, FormData>(registrarseAccion, {});
  const e = estado.errores ?? {};
  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1 text-base font-medium text-zinc-700">
        Tu nombre
        <input name="nombre" required autoComplete="name" defaultValue={estado.valores?.nombre} aria-invalid={!!e.nombre} className={campo} />
        {e.nombre && <span className="text-base font-normal text-red-700">{e.nombre}</span>}
      </label>
      <label className="flex flex-col gap-1 text-base font-medium text-zinc-700">
        Usuario
        <input
          name="usuario"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={estado.valores?.usuario}
          aria-invalid={!!e.usuario}
          className={campo}
        />
        <span className="text-sm font-normal text-zinc-600">Con él entras después. Letras, números, punto, guion o guion bajo.</span>
        {e.usuario && <span className="text-base font-normal text-red-700">{e.usuario}</span>}
      </label>
      <label className="flex flex-col gap-1 text-base font-medium text-zinc-700">
        Contraseña
        <input name="clave" type="password" required autoComplete="new-password" aria-invalid={!!e.clave} className={campo} />
        <span className="text-sm font-normal text-zinc-600">Mínimo 8 caracteres.</span>
        {e.clave && <span className="text-base font-normal text-red-700">{e.clave}</span>}
      </label>
      {/* señuelo anti-robots: fuera de pantalla y fuera del teclado */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sitio web
          <input name="sitio_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {estado.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="h-16 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Creando…" : "Crear cuenta"}
      </button>
    </form>
  );
}
