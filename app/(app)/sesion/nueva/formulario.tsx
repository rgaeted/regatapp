"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AtletaResumen } from "@/lib/atletas/lista";
import { camposDudosos, lecturaAEstado, type CampoOcr, type LecturaOcr } from "@/lib/ocr/lectura";
import { digitosATiempo, digitosDelTexto, formatearDigitos, interpretarTiempoPegado } from "@/lib/sesion/digitos";
import { diaAnterior } from "@/lib/fechas";
import { hoySantiago } from "@/lib/schemas/consentimiento";
import { armarSesionInput, estadoInicial, type EstadoFormulario } from "@/lib/sesion/formulario";
import { diferenciaSuma } from "@/lib/sesion/splits";
import { formatTiempo } from "@/lib/tiempo";
import { guardarSesionAccion } from "./actions";

const DISTANCIAS = [500, 1000, 2000, 5000, 6000];
const CANTIDADES = [4, 5, 8];
const TIPOS: { valor: EstadoFormulario["tipo"]; texto: string }[] = [
  { valor: "entrenamiento", texto: "Entrenamiento" },
  { valor: "test", texto: "Test" },
  { valor: "competencia", texto: "Competencia" },
];
const MODALIDADES: { valor: EstadoFormulario["modalidad"]; texto: string }[] = [
  { valor: "ergometro", texto: "Ergómetro" },
  { valor: "agua", texto: "Agua" },
  { valor: "gimnasio", texto: "Gimnasio" },
  { valor: "otro", texto: "Otro" },
];
// Un split de 500 m cabe en 4 dígitos (m:ss.d): al completarlos se salta al siguiente
// campo, porque el teclado numérico de iOS no tiene tecla "siguiente".
const DIGITOS_SPLIT = 4;

const chip = (activo: boolean) =>
  `h-14 min-w-14 rounded-xl px-4 text-lg font-semibold ${
    activo ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-900"
  }`;
const campo = "h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-xl";
const etiqueta = "text-base font-medium text-zinc-700";

const AVISOS: Record<string, string> = {
  vacia: "No pudimos leer la pantalla en la foto. Completa los datos a mano.",
  limite: "Llegaste al máximo de fotos de hoy. Carga los datos a mano.",
  usada: "Esa foto ya se guardó como una sesión. Si es otra, saca una foto nueva.",
  sin_configurar: "La lectura automática todavía no está activada. Completa los datos a mano.",
  imagen: "No se pudo procesar la foto. Completa los datos a mano.",
};
const AMBAR = "border-amber-500 bg-amber-50";

type Props = {
  atletas: AtletaResumen[];
  atletaInicial: string;
  mostrarSelector: boolean;
  /** Foto de la que se leyó la sesión (fase 2); sin ella es carga manual. */
  capturaId?: string | null;
  lectura?: LecturaOcr | null;
  aviso?: string;
};

export function FormularioSesion({ atletas, atletaInicial, mostrarSelector, capturaId = null, lectura = null, aviso }: Props) {
  const [e, setE] = useState<EstadoFormulario>(() => {
    const base = estadoInicial(crypto.randomUUID(), atletaInicial, new Date());
    return lectura ? lecturaAEstado(lectura, base) : base;
  });
  // Tras "atrás" desde otra pantalla la foto ya se usó: se parte de un formulario limpio.
  const [usarFoto, setUsarFoto] = useState(true);
  const dudosos = useMemo(() => new Set<CampoOcr>(lectura ? camposDudosos(lectura) : []), [lectura]);
  const [tocados, setTocados] = useState<Set<CampoOcr>>(new Set());
  const marcar = (c: CampoOcr) => setTocados((t) => (t.has(c) ? t : new Set(t).add(c)));
  const dudoso = (c: CampoOcr) => usarFoto && dudosos.has(c) && !tocados.has(c);
  const hayFoto = usarFoto && capturaId !== null;
  const [error, setError] = useState("");
  const [otra, setOtra] = useState(false);
  const [pendiente, empezar] = useTransition();
  const refsSplit = useRef<(HTMLInputElement | null)[]>([]);
  const refsSpm = useRef<(HTMLInputElement | null)[]>([]);
  const refGuardar = useRef<HTMLButtonElement>(null);

  // "Atrás" puede restaurar esta página entera (bfcache) con el id de una sesión
  // ya guardada: se parte de cero con un id nuevo.
  useEffect(() => {
    const alMostrar = (ev: PageTransitionEvent) => {
      if (!ev.persisted) return;
      setE(estadoInicial(crypto.randomUUID(), atletaInicial, new Date()));
      setUsarFoto(false);
      setOtra(false);
      setError("");
    };
    window.addEventListener("pageshow", alMostrar);
    return () => window.removeEventListener("pageshow", alMostrar);
  }, [atletaInicial]);

  const cambiar = (parte: Partial<EstadoFormulario>) => setE((s) => ({ ...s, ...parte }));

  const hoy = hoySantiago();
  const ayer = diaAnterior(hoy);
  const totalDs = digitosATiempo(e.tiempoDigitos);
  const tiempoInvalido = e.tiempoDigitos !== "" && totalDs === null;
  const tiemposSplit = e.splitsDigitos.slice(0, e.nSplits).map(digitosATiempo);
  const todosSplits = e.nSplits > 0 && tiemposSplit.every((t) => t !== null);
  const diferencia =
    todosSplits && totalDs !== null ? diferenciaSuma(tiemposSplit as number[], totalDs) : 0;

  const elegirCantidad = (n: number) => {
    const splitsDigitos = Array.from({ length: n }, (_, i) => e.splitsDigitos[i] ?? "");
    const splitsSpm = Array.from({ length: n }, (_, i) => e.splitsSpm[i] ?? "");
    cambiar({ nSplits: n, splitsDigitos, splitsSpm });
    marcar("splits");
  };

  const cambiarSpm = (i: number, texto: string) => {
    const valor = texto.replace(/[^\d.,]/g, "");
    const splitsSpm = Array.from({ length: e.nSplits }, (_, k) => e.splitsSpm[k] ?? "");
    splitsSpm[i] = valor;
    cambiar({ splitsSpm });
    marcar("splits");
    // Un SPM entero tiene 2 cifras: al completarlas se pasa al split siguiente.
    if (/^\d{2}$/.test(valor)) irAlSiguienteTiempo(i);
  };

  const cambiarSplit = (i: number, texto: string, pegado = false) => {
    const digitos = pegado ? interpretarTiempoPegado(texto) : digitosDelTexto(texto);
    const splitsDigitos = [...e.splitsDigitos];
    splitsDigitos[i] = digitos;
    cambiar({ splitsDigitos });
    marcar("splits");
    if (digitos.length >= DIGITOS_SPLIT) irAlSiguiente(i);
  };

  // Del tiempo de un split se pasa a su SPM; del SPM, al tiempo del split siguiente.
  const irAlSiguiente = (i: number) => refsSpm.current[i]?.focus();

  const irAlSiguienteTiempo = (i: number) => {
    const siguiente = refsSplit.current[i + 1];
    if (siguiente) siguiente.focus();
    else refGuardar.current?.focus();
  };

  const guardar = (sinRevisar = false) => {
    setError("");
    const estado = { ...e, fecha: new Date().toISOString() };
    const armado = armarSesionInput(estado);
    if (!armado.ok) {
      setError(Object.values(armado.errores)[0] ?? "Revisa los datos.");
      return;
    }
    empezar(async () => {
      // En éxito la acción redirige y esta promesa no resuelve con valor.
      const r = await guardarSesionAccion(estado, hayFoto ? { capturaId: capturaId as string, sinRevisar } : null);
      if (r?.error) setError(r.error);
    });
  };

  const extra = (
    clave: keyof EstadoFormulario["extras"],
    texto: string,
    modo: "numeric" | "decimal" | "text" = "numeric",
    ocr?: CampoOcr,
  ) => (
    <label className="flex flex-col gap-1">
      <span className={etiqueta}>
        {texto}
        {ocr && dudoso(ocr) && <span className="ml-2 text-sm font-semibold text-amber-700">Revisa</span>}
      </span>
      <input
        className={`${campo} ${ocr && dudoso(ocr) ? AMBAR : ""}`}
        inputMode={modo}
        value={e.extras[clave]}
        onChange={(ev) => {
          cambiar({ extras: { ...e.extras, [clave]: ev.target.value } });
          if (ocr) marcar(ocr);
        }}
      />
    </label>
  );
  const abrirMasDatos = hayFoto && (["fc_promedio", "calorias", "factor_arrastre"] as CampoOcr[]).some((c) => dudoso(c));

  const resumenSuma = useMemo(() => {
    if (diferencia === 0 || totalDs === null) return "";
    const suma = totalDs + diferencia;
    return `Los splits suman ${formatTiempo(suma)}; el total es ${formatTiempo(totalDs)}.`;
  }, [diferencia, totalDs]);

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-8 text-lg"
      onSubmit={(ev) => {
        ev.preventDefault();
        guardar(false);
      }}
    >
      <h1 className="text-2xl font-semibold text-zinc-900">Nueva sesión</h1>

      {hayFoto && lectura && aviso !== "vacia" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-base text-amber-900">
          Leído de la foto. Revisa los campos marcados en ámbar y confirma.
        </p>
      )}
      {(!hayFoto || !lectura || aviso === "vacia") && aviso && AVISOS[aviso] && !hayFoto && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-base text-zinc-700">{AVISOS[aviso]}</p>
      )}
      {hayFoto && (!lectura || aviso === "vacia") && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-base text-zinc-700">
          {(aviso && AVISOS[aviso]) || "No hay datos leídos de la foto. Completa los datos a mano."}
        </p>
      )}

      {mostrarSelector && (
        <label className="flex flex-col gap-1">
          <span className={etiqueta}>Atleta</span>
          <select className={campo} value={e.atletaId} onChange={(ev) => cambiar({ atletaId: ev.target.value })}>
            {atletas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.apellido}, {a.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button key={t.valor} type="button" className={chip(e.tipo === t.valor)} onClick={() => cambiar({ tipo: t.valor })}>
            {t.texto}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className={etiqueta}>
          Distancia (m)
          {dudoso("distancia_m") && <span className="ml-2 text-sm font-semibold text-amber-700">Revisa</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          {DISTANCIAS.map((d) => (
            <button key={d} type="button" className={chip(e.distancia === String(d))} onClick={() => { cambiar({ distancia: String(d) }); marcar("distancia_m"); }}>
              {d}
            </button>
          ))}
        </div>
        <input
          className={`${campo} ${dudoso("distancia_m") ? AMBAR : ""}`}
          inputMode="numeric"
          placeholder="Otra distancia"
          value={e.distancia}
          onChange={(ev) => {
            cambiar({ distancia: ev.target.value.replace(/\D/g, "") });
            marcar("distancia_m");
          }}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className={etiqueta}>
          Tiempo total
          {dudoso("tiempo_ds") && <span className="ml-2 text-sm font-semibold text-amber-700">Revisa</span>}
        </span>
        <input
          className={`${campo} ${tiempoInvalido ? "border-red-600 text-red-700" : dudoso("tiempo_ds") ? AMBAR : ""}`}
          inputMode="numeric"
          placeholder="0:00.0"
          aria-invalid={tiempoInvalido}
          value={formatearDigitos(e.tiempoDigitos)}
          onChange={(ev) => {
            cambiar({ tiempoDigitos: digitosDelTexto(ev.target.value) });
            marcar("tiempo_ds");
          }}
          onPaste={(ev) => {
            ev.preventDefault();
            cambiar({ tiempoDigitos: interpretarTiempoPegado(ev.clipboardData.getData("text")) });
            marcar("tiempo_ds");
          }}
        />
        {tiempoInvalido && <span className="text-base text-red-700">Los segundos deben ser menores que 60.</span>}
      </label>

      {extra("spm", "Remadas por minuto (SPM)", "decimal", "spm_promedio")}

      <div className="flex flex-col gap-2">
        <span className={etiqueta}>
          Splits
          {dudoso("splits") && <span className="ml-2 text-sm font-semibold text-amber-700">Revisa</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          {CANTIDADES.map((n) => (
            <button key={n} type="button" className={chip(e.nSplits === n && !otra)} onClick={() => { setOtra(false); elegirCantidad(n); }}>
              {n}
            </button>
          ))}
          <button type="button" className={chip(otra)} onClick={() => { setOtra(true); elegirCantidad(0); }}>
            Otra
          </button>
          {e.nSplits > 0 && (
            <button type="button" className={chip(false)} onClick={() => { setOtra(false); elegirCantidad(0); }}>
              Sin splits
            </button>
          )}
        </div>
        {otra && (
          <input
            className={campo}
            inputMode="numeric"
            placeholder="¿Cuántos splits?"
            value={e.nSplits || ""}
            onChange={(ev) => elegirCantidad(Math.min(30, Number(ev.target.value.replace(/\D/g, "")) || 0))}
          />
        )}
        {e.nSplits > 0 && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: e.nSplits }, (_, i) => {
              const digitos = e.splitsDigitos[i] ?? "";
              const malo = digitos !== "" && digitosATiempo(digitos) === null;
              return (
                <div key={i} className="grid grid-cols-[1fr_6rem] items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-zinc-600">Split {i + 1}</span>
                  <input
                    ref={(el) => { refsSplit.current[i] = el; }}
                    className={`${campo} ${malo ? "border-red-600 text-red-700" : dudoso("splits") ? AMBAR : ""}`}
                    inputMode="numeric"
                    enterKeyHint={i === e.nSplits - 1 ? "done" : "next"}
                    placeholder="0:00.0"
                    aria-invalid={malo}
                    value={formatearDigitos(digitos)}
                    onChange={(ev) => cambiarSplit(i, ev.target.value)}
                    onPaste={(ev) => {
                      ev.preventDefault();
                      cambiarSplit(i, ev.clipboardData.getData("text"), true);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") {
                        ev.preventDefault();
                        irAlSiguiente(i);
                      }
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-zinc-600">SPM</span>
                  <input
                    ref={(el) => { refsSpm.current[i] = el; }}
                    className={`${campo} ${dudoso("splits") ? AMBAR : ""}`}
                    inputMode="decimal"
                    enterKeyHint={i === e.nSplits - 1 ? "done" : "next"}
                    placeholder="spm"
                    value={e.splitsSpm[i] ?? ""}
                    onChange={(ev) => cambiarSpm(i, ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") {
                        ev.preventDefault();
                        irAlSiguienteTiempo(i);
                      }
                    }}
                  />
                </label>
                </div>
              );
            })}
          </div>
        )}
        {resumenSuma && <p className="rounded-lg bg-amber-100 px-3 py-2 text-base text-amber-900">{resumenSuma}</p>}
      </div>

      <details className="rounded-xl border border-zinc-300 p-4" open={abrirMasDatos || undefined}>
        <summary className="cursor-pointer text-lg font-medium">Más datos</summary>
        <div className="mt-4 flex flex-col gap-3">
          <span className={etiqueta}>Día</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(e.dia === "")} onClick={() => cambiar({ dia: "" })}>Hoy</button>
            <button type="button" className={chip(e.dia === ayer)} onClick={() => cambiar({ dia: ayer })}>Ayer</button>
          </div>
          <input
            type="date"
            className={campo}
            max={hoy}
            value={e.dia}
            onChange={(ev) => cambiar({ dia: ev.target.value === hoy ? "" : ev.target.value })}
          />
          <span className={etiqueta}>Modalidad</span>
          <div className="flex flex-wrap gap-2">
            {MODALIDADES.map((m) => (
              <button key={m.valor} type="button" className={chip(e.modalidad === m.valor)} onClick={() => cambiar({ modalidad: m.valor })}>
                {m.texto}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {extra("fcPromedio", "FC promedio", "numeric", "fc_promedio")}
          {extra("fcMaxima", "FC máxima")}
          {extra("calorias", "Calorías", "numeric", "calorias")}
          {extra("drag", "Drag", "numeric", "factor_arrastre")}
          {extra("rpe", "RPE (1–10)")}
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {extra("descripcion", "Descripción", "text")}
          {extra("notas", "Notas", "text")}
        </div>
      </details>

      <div className="sticky bottom-0 -mx-6 mt-auto flex flex-col gap-2 bg-white/95 px-6 pb-6 pt-3">
        {error && <p role="alert" className="text-base font-medium text-red-700">{error}</p>}
        <button
          ref={refGuardar}
          type="submit"
          disabled={pendiente || tiempoInvalido}
          className="h-16 w-full rounded-xl bg-zinc-900 text-xl font-semibold text-white disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : hayFoto ? "Confirmar y guardar" : "Guardar"}
        </button>
        {hayFoto && (
          <button
            type="button"
            disabled={pendiente || tiempoInvalido}
            onClick={() => guardar(true)}
            className="h-14 w-full rounded-xl bg-zinc-200 text-lg font-semibold text-zinc-900 disabled:opacity-50"
          >
            Guardar sin revisar
          </button>
        )}
      </div>
    </form>
  );
}
