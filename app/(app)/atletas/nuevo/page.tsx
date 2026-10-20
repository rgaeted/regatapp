import { requerirStaff } from "@/lib/acceso/staff";
import { hoySantiago } from "@/lib/schemas/consentimiento";
import { FormularioAlta } from "./formulario";

export default async function PaginaAtletaNuevo() {
  await requerirStaff();
  return <FormularioAlta hoy={hoySantiago()} />;
}
