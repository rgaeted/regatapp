import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARCA } from "@/lib/marca";

// Colores de la PWA: el marino del escudo del club.
export const COLOR_FONDO: string = MARCA.marino;

// El escudo se lee una vez y se incrusta como data URI (ImageResponse no baja archivos).
let escudo: string | undefined;
function escudoUri(): string {
  escudo ??= `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "logo-club.png")).toString("base64")}`;
  return escudo;
}

// Escudo del club centrado sobre el marino. `escala` es la fracción del lado que
// ocupa el escudo: los íconos maskable lo reducen para quedar dentro del círculo
// central seguro (80 %). El PNG original es de 150 px: con un archivo de mayor
// resolución en public/logo-club.png los íconos grandes salen más nítidos.
export function iconoPwa(lado: number, escala: number) {
  const lado_escudo = Math.round(lado * escala);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLOR_FONDO,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={escudoUri()}
        width={lado_escudo}
        height={lado_escudo}
        alt=""
        style={{ borderRadius: "50%", width: lado_escudo, height: lado_escudo }}
      />
    </div>
  );
}
