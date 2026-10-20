import { beforeAll, describe, expect, it, vi } from "vitest";

// lib/env valida process.env al importarse: se fijan valores antes del import.
let leerEnvPublico: typeof import("@/lib/env").leerEnvPublico;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  ({ leerEnvPublico } = await import("@/lib/env"));
});

const valido = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("leerEnvPublico", () => {
  it("parsea una configuración válida", () => {
    expect(leerEnvPublico(valido)).toEqual(valido);
  });

  it("nombra la variable faltante en español", () => {
    const resto: Record<string, string | undefined> = { ...valido };
    delete resto.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => leerEnvPublico(resto)).toThrow(
      /faltantes o inválidas.*NEXT_PUBLIC_SUPABASE_ANON_KEY \(falta\)/,
    );
  });

  it("rechaza una URL inválida", () => {
    expect(() =>
      leerEnvPublico({ ...valido, NEXT_PUBLIC_SITE_URL: "no-es-url" }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL \(valor inválido\)/);
  });
});
