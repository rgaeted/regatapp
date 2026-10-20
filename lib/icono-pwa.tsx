// Colores iguales a --background / --foreground de app/globals.css (tema claro).
export const COLOR_FONDO = "#ffffff";
export const COLOR_TINTA = "#171717";

// Glifo "R" sobre el color de fondo. `escala` reduce el glifo para dejar
// margen de seguridad (íconos maskable: el glifo cabe en el círculo central).
export function iconoPwa(lado: number, escala: number) {
  const glifo = Math.round(lado * escala);
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
      <div
        style={{
          width: glifo,
          height: glifo,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLOR_TINTA,
          borderRadius: Math.round(glifo * 0.22),
          color: COLOR_FONDO,
          fontSize: Math.round(glifo * 0.7),
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        R
      </div>
    </div>
  );
}
