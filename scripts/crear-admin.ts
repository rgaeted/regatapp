import { parseArgs } from "node:util";
import { crearUsuarioStaff } from "../lib/acceso/usuario";
import { generarEnlace } from "../lib/acceso/enlace";
import { entorno, fallar, mensajeDe } from "./comun";

const USO = 'Uso: npm run crear-admin -- --nombre "Nombre" [--correo x@y.cl]';

let valores;
try {
  ({ values: valores } = parseArgs({
    options: { nombre: { type: "string" }, correo: { type: "string" } },
    strict: true,
    allowPositionals: false,
  }));
} catch (e) {
  fallar(`${mensajeDe(e)}\n${USO}`);
}
const nombre = valores.nombre?.trim();
if (!nombre) fallar(`Falta --nombre.\n${USO}`);
const correo = valores.correo?.trim() || undefined;

async function main(nombre: string, correo: string | undefined): Promise<void> {
  const { admin, siteUrl } = entorno();

  let host: string;
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    fallar("NEXT_PUBLIC_SITE_URL no es una URL válida.");
  }
  if (host !== "localhost" && host !== "127.0.0.1" && process.env.CONFIRMAR_PRODUCCION !== "1") {
    fallar(
      `NEXT_PUBLIC_SITE_URL apunta a ${host}, que no es local. Para crear un admin ahí define CONFIRMAR_PRODUCCION=1.`,
    );
  }

  try {
    const id = await crearUsuarioStaff(admin, { nombre, rol: "admin", correo });
    console.error(`Admin creado: ${id}`);
    const url = await generarEnlace(admin, { usuarioId: id, creadoPor: null, siteUrl });
    console.log(url);
  } catch (e) {
    fallar(`Error: ${mensajeDe(e)}`);
  }
}

void main(nombre, correo);
