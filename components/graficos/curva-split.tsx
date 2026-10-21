"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { fechaCorta, fechaLarga } from "@/lib/progreso/formato";
import { ticksBonitos, type PuntoSplit } from "@/lib/progreso/calculos";
import { formatTiempo } from "@/lib/tiempo";

const W = 360;
const H = 220;
const ML = 54;
const MR = 18;
const MT = 22;
const MB = 28;

/**
 * Split /500 de una distancia en el tiempo. El eje va invertido: arriba es más
 * rápido, así que mejorar sube. Una serie, un color, sin leyenda; el mejor
 * punto y el último llevan valor; lo demás se lee tocando o en la tabla.
 */
export function CurvaSplit({ puntos, titulo }: { puntos: PuntoSplit[]; titulo: string }) {
  const [sel, setSel] = useState(puntos.length - 1);
  const valores = puntos.map((p) => p.split500_ds);
  const ticks = ticksBonitos(Math.min(...valores), Math.max(...valores), 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const t0 = Date.parse(puntos[0].fecha);
  const t1 = Date.parse(puntos[puntos.length - 1].fecha);
  const ancho = W - ML - MR;
  const x = (fecha: string) => (puntos.length < 2 || t1 === t0 ? ML + ancho / 2 : ML + ((Date.parse(fecha) - t0) / (t1 - t0)) * ancho);
  const y = (v: number) => MT + ((v - y0) / (y1 - y0)) * (H - MT - MB);

  const mejor = puntos.reduce((m, p, i) => (p.split500_ds < puntos[m].split500_ds ? i : m), 0);
  const ultimo = puntos.length - 1;
  const camino = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.fecha).toFixed(1)} ${y(p.split500_ds).toFixed(1)}`).join(" ");
  const actual = puntos[Math.min(sel, ultimo)];

  const elegir = (e: PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - caja.left) * W) / caja.width;
    let cerca = 0;
    puntos.forEach((p, i) => {
      if (Math.abs(x(p.fecha) - px) < Math.abs(x(puntos[cerca].fecha) - px)) cerca = i;
    });
    setSel(cerca);
  };
  const teclado = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") setSel((s) => Math.max(0, s - 1));
    if (e.key === "ArrowRight") setSel((s) => Math.min(ultimo, s + 1));
  };

  const etiquetaValor = (i: number) => (
    <text
      x={Math.min(Math.max(x(puntos[i].fecha), ML + 16), W - MR - 16)}
      y={y(puntos[i].split500_ds) - 11}
      textAnchor="middle"
      fill="var(--viz-texto)" fontSize={12} fontWeight={600}
    >
      {formatTiempo(puntos[i].split500_ds)}
    </text>
  );

  return (
    <figure
      className="flex flex-col gap-2"
      style={
        {
          "--viz-linea": "#2a78d6",
          "--viz-superficie": "#ffffff",
          "--viz-rejilla": "#e4e4e7",
          "--viz-texto": "#3f3f46",
          "--viz-texto-suave": "#71717a",
        } as React.CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${titulo}: ${puntos.length} sesiones, de ${formatTiempo(puntos[0].split500_ds)} a ${formatTiempo(puntos[ultimo].split500_ds)} por 500 m`}
        tabIndex={0}
        onPointerDown={elegir}
        onPointerMove={(e) => e.pointerType === "mouse" && elegir(e)}
        onKeyDown={teclado}
        className="w-full touch-pan-y select-none rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} stroke="var(--viz-rejilla)" strokeWidth={1} />
            <text x={ML - 8} y={y(t) + 4} textAnchor="end" fill="var(--viz-texto-suave)" fontSize={12}>
              {formatTiempo(t)}
            </text>
          </g>
        ))}
        <text x={ML} y={H - 8} fill="var(--viz-texto-suave)" fontSize={12}>{fechaCorta(puntos[0].fecha)}</text>
        <text x={W - MR} y={H - 8} textAnchor="end" fill="var(--viz-texto-suave)" fontSize={12}>
          {fechaCorta(puntos[ultimo].fecha)}
        </text>

        {/* cruz de la sesión elegida */}
        <line x1={x(actual.fecha)} x2={x(actual.fecha)} y1={y(actual.split500_ds)} y2={H - MB} stroke="var(--viz-texto-suave)" strokeWidth={1} />

        <path d={camino} fill="none" stroke="var(--viz-linea)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {puntos.map((p, i) => (
          <circle
            key={p.id}
            cx={x(p.fecha)}
            cy={y(p.split500_ds)}
            r={p.esRecord ? 5.5 : 4}
            fill="var(--viz-linea)"
            stroke="var(--viz-superficie)"
            strokeWidth={2}
          >
            {i === sel && <animate attributeName="r" from="7" to={p.esRecord ? 5.5 : 4} dur="0.15s" />}
          </circle>
        ))}
        {etiquetaValor(mejor)}
        {ultimo !== mejor && etiquetaValor(ultimo)}
      </svg>

      <p aria-live="polite" className="text-base text-zinc-800">
        <strong>{formatTiempo(actual.split500_ds)}</strong> /500 m · {formatTiempo(actual.tiempo_ds)} en total ·{" "}
        {fechaLarga(actual.fecha)}
        {actual.esRecord && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-sm font-semibold text-blue-900">Mejor marca del momento</span>}
      </p>
      <p className="text-sm text-zinc-600">Más arriba es más rápido. Toca el gráfico para ver cada sesión.</p>

      <details className="text-base">
        <summary className="cursor-pointer text-zinc-700 underline">Ver como tabla</summary>
        <table className="mt-2 w-full text-left text-base">
          <thead>
            <tr className="text-sm text-zinc-600">
              <th className="py-1 font-medium">Fecha</th>
              <th className="py-1 font-medium">/500 m</th>
              <th className="py-1 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...puntos].reverse().map((p) => (
              <tr key={p.id} className="border-t border-zinc-200">
                <td className="py-1">{fechaLarga(p.fecha)}</td>
                <td className="py-1">{formatTiempo(p.split500_ds)}</td>
                <td className="py-1">{formatTiempo(p.tiempo_ds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
