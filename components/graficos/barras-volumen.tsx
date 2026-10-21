"use client";

import { useState, type KeyboardEvent } from "react";
import { MARCA } from "@/lib/marca";
import { fechaCorta, kilometros } from "@/lib/progreso/formato";
import { ticksBonitos, type SemanaVolumen } from "@/lib/progreso/calculos";

const W = 360;
const H = 200;
const ML = 44;
const MR = 12;
const MT = 22;
const MB = 28;
const MAX_BARRA = 24;

/**
 * Metros por semana. Columnas finas con la punta redondeada y la base recta; una
 * semana sin entrenar queda como hueco, no desaparece. Se lee tocando una
 * columna (o con las flechas) y en la tabla.
 */
export function BarrasVolumen({ semanas, titulo }: { semanas: SemanaVolumen[]; titulo: string }) {
  const [sel, setSel] = useState(semanas.length - 1);
  const maxKm = Math.max(...semanas.map((s) => s.metros)) / 1000;
  const ticks = ticksBonitos(0, Math.max(maxKm, 1), 3);
  const tope = ticks[ticks.length - 1];
  const ancho = W - ML - MR;
  const banda = ancho / semanas.length;
  const grosor = Math.min(MAX_BARRA, banda - 4);
  const yKm = (km: number) => MT + (1 - km / tope) * (H - MT - MB);
  const base = yKm(0);
  const actual = semanas[sel];

  const teclado = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") setSel((s) => Math.max(0, s - 1));
    if (e.key === "ArrowRight") setSel((s) => Math.min(semanas.length - 1, s + 1));
  };

  return (
    <figure
      className="flex flex-col gap-2"
      style={
        {
          "--viz-barra": MARCA.turquesaOscuro,
          "--viz-barra-elegida": MARCA.marino,
          "--viz-rejilla": "#d3e0e4",
          "--viz-texto": MARCA.marino,
          "--viz-texto-suave": "#476572",
        } as React.CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${titulo}: ${semanas.length} semanas, máximo ${kilometros(Math.max(...semanas.map((s) => s.metros)))}`}
        tabIndex={0}
        onKeyDown={teclado}
        className="w-full select-none rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={W - MR} y1={yKm(t)} y2={yKm(t)} stroke="var(--viz-rejilla)" strokeWidth={1} />
            <text x={ML - 8} y={yKm(t) + 4} textAnchor="end" fill="var(--viz-texto-suave)" fontSize={12}>
              {t === 0 ? "0" : `${t} km`}
            </text>
          </g>
        ))}
        {semanas.map((s, i) => {
          const km = s.metros / 1000;
          const cx = ML + banda * i + banda / 2;
          const alto = base - yKm(km);
          const r = Math.min(4, alto);
          const elegida = i === sel;
          return (
            <g key={s.inicio}>
              {alto > 0 && (
                // Punta redondeada de 4 px, base recta sobre el eje.
                <path
                  d={`M${cx - grosor / 2} ${base} V${base - alto + r} Q${cx - grosor / 2} ${base - alto} ${cx - grosor / 2 + r} ${base - alto} H${cx + grosor / 2 - r} Q${cx + grosor / 2} ${base - alto} ${cx + grosor / 2} ${base - alto + r} V${base} Z`}
                  fill={elegida ? "var(--viz-barra-elegida)" : "var(--viz-barra)"}
                />
              )}
              {/* zona táctil de toda la columna, más grande que la barra */}
              <rect
                x={ML + banda * i}
                y={MT - 10}
                width={banda}
                height={H - MT - MB + 10}
                fill="transparent"
                onPointerDown={() => setSel(i)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setSel(i)}
              />
            </g>
          );
        })}
        <text x={ML} y={H - 8} fill="var(--viz-texto-suave)" fontSize={12}>{fechaCorta(semanas[0].inicio)}</text>
        <text x={W - MR} y={H - 8} textAnchor="end" fill="var(--viz-texto-suave)" fontSize={12}>
          {fechaCorta(semanas[semanas.length - 1].inicio)}
        </text>
        {semanas[semanas.length - 1].metros > 0 && (
          <text
            x={W - MR}
            y={yKm(semanas[semanas.length - 1].metros / 1000) - 6}
            textAnchor="end"
            fill="var(--viz-texto)" fontSize={12} fontWeight={600}
          >
            {kilometros(semanas[semanas.length - 1].metros)}
          </text>
        )}
      </svg>

      <p aria-live="polite" className="text-base text-zinc-800">
        Semana del {fechaCorta(actual.inicio)}: <strong>{kilometros(actual.metros)}</strong>
      </p>

      <details className="text-base">
        <summary className="cursor-pointer text-mar-700 underline">Ver como tabla</summary>
        <table className="mt-2 w-full text-left text-base">
          <thead>
            <tr className="text-sm text-zinc-600">
              <th className="py-1 font-medium">Semana del</th>
              <th className="py-1 font-medium">Distancia</th>
            </tr>
          </thead>
          <tbody>
            {[...semanas].reverse().map((s) => (
              <tr key={s.inicio} className="border-t border-zinc-200">
                <td className="py-1">{fechaCorta(s.inicio)}</td>
                <td className="py-1">{kilometros(s.metros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
