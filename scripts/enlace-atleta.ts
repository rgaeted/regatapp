import { parseArgs } from "node:util";
import { asegurarUsuarioAtleta } from "../lib/acceso/usuario";
import { generarEnlace } from "../lib/acceso/enlace";
import { entorno, fallar, mensajeDe } from "./comun";

const USO = "Uso: npm run enlace:atleta -- --atleta <uuid>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let valores;
try {
  ({ values: valores } = parseArgs({
    options: { atleta: { type: "string" } },
    strict: true,
    allowPositionals: false,
  }));
} catch (e) {
  fallar(`${mensajeDe(e)}\n${USO}`);
}
const atletaId = valores.atleta?.trim();
if (!atletaId || !UUID.test(atletaId)) fallar(`--atleta debe ser un UUID válido.\n${USO}`);

async function main(atletaId: string): Promise<void> {
  const { admin, siteUrl } = entorno();

  try {
    const usuarioId = await asegurarUsuarioAtleta(admin, atletaId);
    const url = await generarEnlace(admin, { usuarioId, creadoPor: null, siteUrl });
    console.log(url);
  } catch (e) {
    fallar(`Error: ${mensajeDe(e)}`);
  }
}

void main(atletaId);
