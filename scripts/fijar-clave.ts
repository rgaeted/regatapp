import { parseArgs } from "node:util";
import { establecerClaveStaff, normalizarUsuario } from "../lib/acceso/clave";
import { entorno, esEntornoLocal, fallar, mensajeDe } from "./comun";

const USO =
  'Uso: CLAVE="la clave" npm run fijar-clave -- --nombre "Nombre del perfil" --usuario nombre.usuario\n' +
  "La clave va en la variable CLAVE (no como argumento, para que no quede en el historial).";

let valores;
try {
  ({ values: valores } = parseArgs({
    options: { nombre: { type: "string" }, usuario: { type: "string" } },
    strict: true,
    allowPositionals: false,
  }));
} catch (e) {
  fallar(`${mensajeDe(e)}\n${USO}`);
}
const nombre = valores.nombre?.trim();
const usuario = valores.usuario ? normalizarUsuario(valores.usuario) : null;
const clave = process.env.CLAVE ?? "";
if (!nombre) fallar(`Falta --nombre.\n${USO}`);
if (!usuario) fallar(`Falta --usuario o no es válido (3 a 32 caracteres: a-z, 0-9, punto, guion, guion bajo).\n${USO}`);
if (!clave) fallar(`Falta la variable CLAVE.\n${USO}`);

async function main(nombre: string, usuario: string, clave: string): Promise<void> {
  const { admin } = entorno();

  const local = esEntornoLocal([["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL]]);
  if (!local.ok && process.env.CONFIRMAR_PRODUCCION !== "1") {
    fallar(`No se fija la clave: ${local.noLocales.join(" y ")} no apunta a un host local. Si es intencional, define CONFIRMAR_PRODUCCION=1.`);
  }

  try {
    const { data, error } = await admin.from("perfil").select("user_id, rol").eq("nombre", nombre).in("rol", ["admin", "entrenador"]);
    if (error) throw new Error(error.message);
    if (data.length === 0) fallar(`No hay un admin o entrenador con nombre "${nombre}".`);
    if (data.length > 1) fallar(`Hay ${data.length} perfiles con nombre "${nombre}"; no se sabe a cuál fijar la clave.`);
    await establecerClaveStaff(admin, data[0].user_id as string, usuario, clave);
    console.error(`Listo: ${data[0].rol} "${nombre}" entra en /login con el usuario "${usuario}".`);
  } catch (e) {
    fallar(`Error: ${mensajeDe(e)}`);
  }
}

void main(nombre, usuario, clave);
