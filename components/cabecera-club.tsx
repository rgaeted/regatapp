import Image from "next/image";
import Link from "next/link";

/**
 * Cabecera de la app autenticada: el escudo del club sobre el marino, con la
 * línea de agua (turquesa) debajo. Lleva siempre al inicio.
 */
export function CabeceraClub() {
  return (
    <header className="border-b-4 border-mar-500 bg-zinc-900 text-white">
      <div className="mx-auto flex w-full max-w-md items-center px-6 py-3">
        <Link href="/" className="flex items-center gap-3" aria-label="Regatapp, ir al inicio">
          <Image src="/logo-club.png" alt="" width={44} height={44} className="rounded-full" priority />
          <span className="leading-tight">
            <span className="block text-sm font-bold uppercase tracking-wider">Coastal Rowing Club</span>
            <span className="block text-sm text-mar-100">Colegio Patagonia</span>
          </span>
        </Link>
      </div>
    </header>
  );
}

/** Versión grande para las pantallas de entrada (sin sesión). */
export function PortadaClub() {
  return (
    <header className="flex flex-col items-center gap-3 border-b-4 border-mar-500 bg-zinc-950 px-6 pb-7 pt-9 text-center text-white">
      <Image src="/logo-club.png" alt="Escudo del Coastal Rowing Club, Colegio Patagonia" width={104} height={104} className="rounded-full" priority />
      <p className="leading-tight">
        <span className="block text-base font-bold uppercase tracking-wider">Coastal Rowing Club</span>
        <span className="block text-base text-mar-100">Colegio Patagonia</span>
      </p>
    </header>
  );
}
