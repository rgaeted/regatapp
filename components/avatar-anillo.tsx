import { iniciales } from "@/lib/atletas/iniciales";

/**
 * Las iniciales de la persona dentro del aro turquesa del escudo: el mismo
 * motivo del club, una vez por atleta. Es decorativo (el nombre va al lado).
 */
export function AvatarAnillo({ nombre, apellido = "", tam = 44 }: { nombre: string; apellido?: string; tam?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-900 font-bold text-white ring-[3px] ring-mar-500"
      style={{ width: tam, height: tam, fontSize: Math.round(tam * 0.38) }}
    >
      {iniciales(nombre, apellido)}
    </span>
  );
}
