import { parseArgs } from "node:util";
import { crearUsuarioStaff } from "../lib/acceso/usuario";
import { generarEnlace } from "../lib/acceso/enlace";
import { entorno, esEntornoLocal, fallar, mensajeDe } from "./comun";

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

  // Se evalúa contra la base que se va a escribir (Supabase) y contra el sitio.
  const local = esEntornoLocal([
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["NEXT_PUBLIC_SITE_URL", siteUrl],
  ]);
  if (!local.ok && process.env.CONFIRMAR_PRODUCCION !== "1") {
    fallar(
      `No se crea el admin: ${local.noLocales.join(" y ")} no apunta(n) a un host local. ` +
        "Si es intencional, define CONFIRMAR_PRODUCCION=1.",
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
