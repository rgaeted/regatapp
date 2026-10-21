import { PortadaClub } from "@/components/cabecera-club";

// Pantallas sin sesión (entrar, login, sin acceso): el escudo arriba y el contenido debajo.
export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortadaClub />
      {children}
    </>
  );
}
