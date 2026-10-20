import type { MetadataRoute } from "next";
import { COLOR_FONDO } from "@/lib/icono-pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Regatapp",
    short_name: "Regatapp",
    description: "Registro de entrenamientos, tests y competencias de remo",
    lang: "es-CL",
    start_url: "/",
    display: "standalone",
    background_color: COLOR_FONDO,
    theme_color: COLOR_FONDO,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/512-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
