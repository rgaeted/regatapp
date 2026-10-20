import { describe, expect, it } from "vitest";
import { construirEnvLocal, leerEstado } from "../../scripts/env-local-lib.mjs";

const SALIDA = [
  'API_URL="http://127.0.0.1:54321"',
  'GRAPHQL_URL="http://127.0.0.1:54321/graphql/v1"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"',
  'ANON_KEY="eyJanon.payload.firma"',
  'SERVICE_ROLE_KEY="eyJservice.payload.firma"',
  "",
].join("\n");

const EJEMPLO = [
  "NEXT_PUBLIC_SUPABASE_URL=",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
  "SUPABASE_SERVICE_ROLE_KEY=        # solo servidor",
  "OCR_MODEL=claude-sonnet-5-5       # solo servidor",
  "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
  "",
].join("\n");

describe("leerEstado", () => {
  it("lee valores con comillas", () => {
    const e = leerEstado(SALIDA);
    expect(e.API_URL).toBe("http://127.0.0.1:54321");
    expect(e.ANON_KEY).toBe("eyJanon.payload.firma");
  });
  it("lee valores sin comillas", () => {
    expect(leerEstado("API_URL=http://127.0.0.1:54321\nANON_KEY=abc")).toEqual({
      API_URL: "http://127.0.0.1:54321",
      ANON_KEY: "abc",
    });
  });
  it("acepta CRLF e ignora líneas que no son variables", () => {
    const e = leerEstado('Aviso: algo\r\nAPI_URL="http://x"\r\n\r\nANON_KEY="k"\r\n');
    expect(e).toEqual({ API_URL: "http://x", ANON_KEY: "k" });
  });
});

describe("construirEnvLocal", () => {
  const estado = leerEstado(SALIDA);

  it("rellena las tres variables y deja intactas las demás líneas", () => {
    const out = construirEnvLocal(estado, EJEMPLO).split("\n");
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321");
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJanon.payload.firma");
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY=eyJservice.payload.firma");
    expect(out).toContain("OCR_MODEL=claude-sonnet-5-5       # solo servidor");
    expect(out).toContain("NEXT_PUBLIC_SITE_URL=http://localhost:3000");
  });

  it("agrega las variables que .env.example no tiene", () => {
    const out = construirEnvLocal(estado, "OCR_MODEL=x\n").split("\n");
    expect(out).toEqual([
      "OCR_MODEL=x",
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJanon.payload.firma",
      "SUPABASE_SERVICE_ROLE_KEY=eyJservice.payload.firma",
      "",
    ]);
  });

  it("funciona con CRLF en .env.example", () => {
    const out = construirEnvLocal(estado, EJEMPLO.replace(/\n/g, "\r\n"));
    expect(out).not.toContain("\r");
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321");
  });

  it("acepta los nombres nuevos SECRET_KEY y PUBLISHABLE_KEY", () => {
    const nuevo = leerEstado('API_URL="http://x"\nPUBLISHABLE_KEY="pub"\nSECRET_KEY="sec"');
    const out = construirEnvLocal(nuevo, EJEMPLO);
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=pub");
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY=sec");
  });

  it("prefiere ANON_KEY y SERVICE_ROLE_KEY si vienen ambas", () => {
    const ambos = { ...estado, PUBLISHABLE_KEY: "pub", SECRET_KEY: "sec" };
    const out = construirEnvLocal(ambos, EJEMPLO);
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJanon.payload.firma");
  });

  it("falla en español si falta una clave", () => {
    expect(() => construirEnvLocal({ API_URL: "http://x", ANON_KEY: "k" }, EJEMPLO)).toThrow(
      /supabase status no devolvió SERVICE_ROLE_KEY ni SECRET_KEY/,
    );
    expect(() => construirEnvLocal({}, EJEMPLO)).toThrow(/API_URL/);
  });
});
