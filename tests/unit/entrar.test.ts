import { describe, expect, it } from "vitest";
import { rutaFalloEntrar } from "@/lib/acceso/canjear";

const TOKEN = "pkce_abc-123_XYZ";

describe("rutaFalloEntrar", () => {
  it.each(["inexistente", "vencido", "usado", "sin_acceso"] as const)("%s: no lleva el token", (motivo) => {
    expect(rutaFalloEntrar(motivo, TOKEN)).toBe(`/entrar?e=${motivo}`);
  });

  it("reintentar con token bien formado: lo lleva para reintentar", () => {
    expect(rutaFalloEntrar("reintentar", TOKEN)).toBe(`/entrar?e=reintentar&t=${TOKEN}`);
  });

  it.each(["", "<script>", "a b", "x".repeat(600), "abc&e=ok", "%00"])(
    "reintentar con token mal formado (%s): no lo lleva",
    (t) => {
      expect(rutaFalloEntrar("reintentar", t)).toBe("/entrar?e=reintentar");
    },
  );
});
