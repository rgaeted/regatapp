// Lógica pura de `npm run env:local`: sin disco ni procesos, para poder probarla.

// Variable de .env.local -> claves posibles de `supabase status -o env`, en orden
// de preferencia. Las versiones nuevas del CLI pueden llamar SECRET_KEY y
// PUBLISHABLE_KEY a las claves de servicio y anónima.
export const MAPA = {
  NEXT_PUBLIC_SUPABASE_URL: ["API_URL"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ["ANON_KEY", "PUBLISHABLE_KEY"],
  SUPABASE_SERVICE_ROLE_KEY: ["SERVICE_ROLE_KEY", "SECRET_KEY"],
};

/** @param {string} salida @returns {Record<string, string>} */
// Convierte la salida `CLAVE="valor"` (comillas opcionales, LF o CRLF) en un mapa.
export function leerEstado(salida) {
  /** @type {Record<string, string>} */
  const estado = {};
  for (const linea of salida.split(/\r?\n/)) {
    const m = linea.trim().match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    if (valor.length >= 2 && valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    estado[m[1]] = valor;
  }
  return estado;
}

// Construye el texto de .env.local a partir del estado y del contenido de
// .env.example: rellena las tres variables, deja intactas las demás líneas y
// agrega al final las que .env.example no tenga. Lanza Error en español si falta
// alguna clave en el estado.
/** @param {Record<string, string>} estado @param {string} ejemplo @returns {string} */
export function construirEnvLocal(estado, ejemplo) {
  const valores = {};
  for (const [variable, claves] of Object.entries(MAPA)) {
    const clave = claves.find((c) => estado[c]);
    if (!clave) {
      throw new Error(
        `supabase status no devolvió ${claves.join(" ni ")}. ¿Está corriendo \`supabase start\`?`,
      );
    }
    valores[variable] = estado[clave];
  }

  const puestas = new Set();
  const lineas = ejemplo.split(/\r?\n/).map((linea) => {
    const m = linea.match(/^([A-Z0-9_]+)=/);
    if (m && m[1] in valores) {
      puestas.add(m[1]);
      return `${m[1]}=${valores[m[1]]}`;
    }
    return linea;
  });
  while (lineas.length && lineas[lineas.length - 1] === "") lineas.pop();
  for (const variable of Object.keys(valores)) {
    if (!puestas.has(variable)) lineas.push(`${variable}=${valores[variable]}`);
  }
  return lineas.join("\n") + "\n";
}
