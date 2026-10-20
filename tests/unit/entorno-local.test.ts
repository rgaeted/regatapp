import { describe, expect, it } from "vitest";
import { esEntornoLocal } from "../../scripts/comun";

const evalua = (...urls: string[]) => esEntornoLocal(urls.map((u, i) => [`V${i}`, u]));

describe("esEntornoLocal", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:54321", "http://[::1]:3000", "http://LOCALHOST"])(
    "acepta %s",
    (u) => expect(evalua(u).ok).toBe(true),
  );
  it.each([
    "http://localhost.evil.com",
    "http://localhost@evil.com",
    "http://evil.com/localhost",
    "https://abc.supabase.co",
    "no es url",
    "",
  ])("rechaza %s", (u) => expect(evalua(u)).toEqual({ ok: false, noLocales: ["V0"] }));
  it("nombra solo las variables no locales y rechaza valores ausentes", () => {
    expect(esEntornoLocal([["A", "http://localhost"], ["B", "https://x.co"], ["C", undefined]])).toEqual({
      ok: false,
      noLocales: ["B", "C"],
    });
  });
});
