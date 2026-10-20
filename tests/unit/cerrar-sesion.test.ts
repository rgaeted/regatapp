// "Cerrar sesión" cierra solo este dispositivo, no todos los del usuario.
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: async () => ({ auth: { signOut: m.signOut } }),
}));

const { cerrarSesion } = await import("@/app/(app)/actions");

describe("cerrarSesion", () => {
  it("hace signOut con scope local y va a /sin-acceso", async () => {
    await expect(cerrarSesion()).rejects.toThrow("NEXT_REDIRECT /sin-acceso");
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
