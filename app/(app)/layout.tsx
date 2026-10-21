import { CabeceraClub } from "@/components/cabecera-club";
import { requerirUsuario } from "@/lib/acceso/actual";

// Primera barrera. No basta sola: ver el aviso en lib/acceso/actual.ts.
export default async function LayoutApp({ children }: LayoutProps<"/">) {
  await requerirUsuario();
  return (
    <>
      <CabeceraClub />
      {children}
    </>
  );
}
