import { ImageResponse } from "next/og";
import { iconoPwa } from "@/lib/icono-pwa";

// Solo estos tamaños existen; `escala` es la fracción del lado que ocupa el glifo.
// El maskable usa 0.56: el escudo queda dentro del círculo central del 80 % (zona segura).
const ICONOS: Record<string, { lado: number; escala: number }> = {
  "192": { lado: 192, escala: 0.8 },
  "512": { lado: 512, escala: 0.8 },
  "512-maskable": { lado: 512, escala: 0.56 },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tam: string }> },
) {
  const { tam } = await params;
  const icono = Object.hasOwn(ICONOS, tam) ? ICONOS[tam] : undefined;
  if (!icono) {
    return new Response("No encontrado", { status: 404 });
  }

  const imagen = new ImageResponse(iconoPwa(icono.lado, icono.escala), {
    width: icono.lado,
    height: icono.lado,
  });
  imagen.headers.set(
    "Cache-Control",
    "public, max-age=86400",
  );
  return imagen;
}
