"use client";

import Link from "next/link";
import { useState } from "react";

type Atleta = { id: string; nombre: string; apellido: string; activo: boolean };

export function ListaAtletas({ atletas }: { atletas: Atleta[] }) {
  const [q, setQ] = useState("");
  const buscado = q.trim().toLowerCase();
  const visibles = atletas.filter((a) => `${a.nombre} ${a.apellido}`.toLowerCase().includes(buscado));

  if (atletas.length === 0) return <p className="text-zinc-600">Todavía no hay atletas.</p>;
  return (
    <>
      <input
        className="h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-lg"
        placeholder="Buscar por nombre"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="flex flex-col divide-y divide-zinc-200">
        {visibles.map((a) => (
          <li key={a.id}>
            <Link href={`/atletas/${a.id}`} className="flex min-h-14 items-center justify-between py-3">
              <span className="font-medium">{a.apellido}, {a.nombre}</span>
              {!a.activo && <span className="text-sm text-zinc-500">Inactivo</span>}
            </Link>
          </li>
        ))}
      </ul>
      {visibles.length === 0 && <p className="text-zinc-600">Nadie coincide con la búsqueda.</p>}
    </>
  );
}
