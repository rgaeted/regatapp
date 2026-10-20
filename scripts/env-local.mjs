// Escribe .env.local con las claves de `supabase status -o env`
// y conserva las demás líneas de .env.example.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { construirEnvLocal, leerEstado } from "./env-local-lib.mjs";

try {
  const salida = execSync("npx supabase status -o env", { encoding: "utf8" });
  const texto = construirEnvLocal(leerEstado(salida), readFileSync(".env.example", "utf8"));
  writeFileSync(".env.local", texto);
  console.log("Escrito .env.local con las claves de Supabase local.");
} catch (e) {
  console.error(`No se pudo escribir .env.local: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
