"use client";

import { useActionState } from "react";
import { crearAtletaAccion, type EstadoAlta } from "./actions";

const campo = "h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-lg";
const etiqueta = "flex flex-col gap-1 text-base font-medium text-zinc-700";

export function FormularioAlta({ hoy }: { hoy: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAlta, FormData>(crearAtletaAccion, {});
  const v = estado.valores ?? {};

  return (
    <form action={accion} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-6 py-8 text-lg">
      <h1 className="text-2xl font-semibold text-zinc-900">Nuevo atleta</h1>

      <label className={etiqueta}>Nombre
        <input name="nombre" required className={campo} defaultValue={v.nombre} autoComplete="off" />
      </label>
      <label className={etiqueta}>Apellido
        <input name="apellido" required className={campo} defaultValue={v.apellido} autoComplete="off" />
      </label>
      <label className={etiqueta}>Fecha de nacimiento
        <input name="fecha_nacimiento" type="date" className={campo} defaultValue={v.fecha_nacimiento} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={etiqueta}>Peso (kg)
          <input name="peso_kg" inputMode="decimal" className={campo} defaultValue={v.peso_kg} />
        </label>
        <label className={etiqueta}>Altura (cm)
          <input name="altura_cm" inputMode="numeric" className={campo} defaultValue={v.altura_cm} />
        </label>
        <label className={etiqueta}>Sexo
          <select name="sexo" className={campo} defaultValue={v.sexo ?? ""}>
            <option value="">—</option>
            <option value="F">F</option>
            <option value="M">M</option>
            <option value="X">X</option>
          </select>
        </label>
        <label className={etiqueta}>Categoría
          <select name="categoria_peso" className={campo} defaultValue={v.categoria_peso ?? ""}>
            <option value="">—</option>
            <option value="ligero">Ligero</option>
            <option value="abierto">Abierto</option>
          </select>
        </label>
      </div>

      <fieldset className="mt-2 flex flex-col gap-4 rounded-xl border border-zinc-300 p-4">
        <legend className="px-2 text-lg font-semibold">Consentimiento (obligatorio)</legend>
        <label className={etiqueta}>Quién autoriza
          <input name="c_nombre" required className={campo} defaultValue={v.c_nombre} autoComplete="off" />
        </label>
        <label className={etiqueta}>RUT (opcional)
          <input name="c_rut" className={campo} defaultValue={v.c_rut} autoComplete="off" />
        </label>
        <label className={etiqueta}>Relación
          <select name="c_relacion" className={campo} defaultValue={v.c_relacion ?? "apoderado"}>
            <option value="apoderado">Apoderado</option>
            <option value="tutor_legal">Tutor legal</option>
            <option value="propio">Propio (mayor de 18)</option>
          </select>
        </label>
        <label className={etiqueta}>Medio
          <select name="c_medio" className={campo} defaultValue={v.c_medio ?? "papel"}>
            <option value="papel">Papel</option>
            <option value="digital">Digital</option>
          </select>
        </label>
        <label className={etiqueta}>Fecha en que lo otorgó
          <input name="c_fecha" type="date" required max={hoy} className={campo} defaultValue={v.c_fecha ?? hoy} />
        </label>
        <input type="hidden" name="c_version" value="v1" />
      </fieldset>

      {estado.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="h-16 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Crear atleta"}
      </button>
    </form>
  );
}
