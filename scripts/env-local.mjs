// Escribe .env.local con las claves de `supabase status -o env`
// y conserva las demás líneas de .env.example.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const salida = execSync("npx supabase status -o env", { encoding: "utf8" });
const estado = {};
for (const linea of salida.split(/\r?\n/)) {
  const m = linea.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) estado[m[1]] = m[2];
}

const mapa = {
  NEXT_PUBLIC_SUPABASE_URL: "API_URL",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "ANON_KEY",
  SUPABASE_SERVICE_ROLE_KEY: "SERVICE_ROLE_KEY",
};

for (const clave of Object.values(mapa)) {
  if (!estado[clave]) {
    console.error(`supabase status no devolvió ${clave}. ¿Está corriendo \`supabase start\`?`);
    process.exit(1);
  }
}

const lineas = readFileSync(".env.example", "utf8")
  .split(/\r?\n/)
  .map((linea) => {
    const m = linea.match(/^([A-Z0-9_]+)=/);
    if (m && mapa[m[1]]) return `${m[1]}=${estado[mapa[m[1]]]}`;
    return linea;
  });

writeFileSync(".env.local", lineas.join("\n"));
console.log("Escrito .env.local con las claves de Supabase local.");
