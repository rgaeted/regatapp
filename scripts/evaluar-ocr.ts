import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";
import { compararLectura, parsearVerdad, resumir, type Aciertos } from "../lib/ocr/evaluar";
import { leerFoto, type TipoImagen } from "../lib/ocr/leer";
import { fallar, mensajeDe } from "./comun";

const USO =
  "Uso: npm run ocr:evaluar -- --carpeta fotos/ --verdad fotos/verdad.csv [--modelo claude-sonnet-5-5]\n" +
  "verdad.csv: archivo,distancia_m,tiempo   (p. ej.  foto1.jpg,2000,7:35.5)\n" +
  "Necesita ANTHROPIC_API_KEY. Cada foto es una llamada al modelo y cuesta dinero.";

const TIPOS: Record<string, TipoImagen> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const META = 0.9; // criterio de salida de la fase (AGENTS.md §7)

let valores;
try {
  ({ values: valores } = parseArgs({
    options: { carpeta: { type: "string" }, verdad: { type: "string" }, modelo: { type: "string" } },
    strict: true,
    allowPositionals: false,
  }));
} catch (e) {
  fallar(`${mensajeDe(e)}\n${USO}`);
}
if (!valores.carpeta || !valores.verdad) fallar(`Faltan --carpeta y --verdad.\n${USO}`);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.ANTHROPIC_API_KEY) fallar(`Falta ANTHROPIC_API_KEY (en el entorno o en .env.local).\n${USO}`);

async function main(carpeta: string, rutaVerdad: string, modelo: string): Promise<void> {
  const verdad = parsearVerdad(readFileSync(rutaVerdad, "utf8"));
  const cliente = new Anthropic();
  const resultados: Aciertos[] = [];

  for (const v of verdad) {
    const archivo = join(carpeta, v.archivo);
    const tipo = TIPOS[extname(archivo).toLowerCase()];
    if (!existsSync(archivo) || !tipo) {
      console.error(`SALTADA ${v.archivo}: no existe o no es una imagen admitida`);
      continue;
    }
    const base64 = readFileSync(archivo).toString("base64");
    const r = await leerFoto((p) => cliente.messages.parse(p), { base64, mediaType: tipo }, modelo);
    const aciertos = compararLectura(v, r.ok ? r.lectura : null);
    resultados.push(aciertos);
    const marca = (b: boolean) => (b ? "ok " : "MAL");
    console.log(
      `${v.archivo.padEnd(28)} dist ${marca(aciertos.distancia)}  tiempo ${marca(aciertos.tiempo)}  split ${marca(aciertos.split)}` +
        (r.ok ? "" : `  (${r.motivo})`),
    );
  }

  const res = resumir(resultados);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`\n${res.fotos} fotos · distancia ${pct(res.porCampo.distancia)} · tiempo ${pct(res.porCampo.tiempo)} · split ${pct(res.porCampo.split)}`);
  console.log(`Campos principales correctos: ${pct(res.total)} (meta ${pct(META)}) → ${res.total >= META ? "CUMPLE" : "NO cumple"}`);
  if (res.fotos < 50) console.log(`Ojo: el criterio pide 50 fotos reales; se evaluaron ${res.fotos}.`);
}

void main(valores.carpeta, valores.verdad, valores.modelo || process.env.OCR_MODEL || "claude-sonnet-5-5").catch((e) =>
  fallar(`Error: ${mensajeDe(e)}`),
);
