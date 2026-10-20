// Puerta de acceso por petición (lib/acceso/actual.ts) con Supabase simulado:
// tri-estado, y un error transitorio de GoTrue nunca cierra la sesión.
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  perfilConAcceso: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: async () => ({ auth: { getUser: m.getUser, signOut: m.signOut } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({}) }));
vi.mock("@/lib/acceso/enlace", () => ({ perfilConAcceso: m.perfilConAcceso }));

const { obtenerAcceso, requerirUsuario } = await import("@/lib/acceso/actual");

const USUARIO = { id: "u-1" };
const sinUsuario = (error: Error) => ({ data: { user: null }, error });

beforeEach(() => {
  vi.clearAllMocks();
  m.signOut.mockResolvedValue({ error: null });
});

describe("obtenerAcceso: tri-estado", () => {
  it("sin cookie de sesión → sin_sesion", async () => {
    m.getUser.mockResolvedValue(sinUsuario(new AuthSessionMissingError()));
    expect(await obtenerAcceso()).toEqual({ estado: "sin_sesion" });
    expect(m.perfilConAcceso).not.toHaveBeenCalled();
  });

  it("JWT inválido o usuario borrado (401/403 de GoTrue) → sin_sesion", async () => {
    for (const status of [401, 403]) {
      m.getUser.mockResolvedValue(sinUsuario(new AuthApiError("invalid JWT", status, "bad_jwt")));
      expect(await obtenerAcceso()).toEqual({ estado: "sin_sesion" });
    }
  });

  it("usuario válido sin acceso vigente → sin_acceso", async () => {
    m.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
    m.perfilConAcceso.mockResolvedValue(null);
    expect(await obtenerAcceso()).toEqual({ estado: "sin_acceso" });
    expect(m.perfilConAcceso).toHaveBeenCalledWith(expect.anything(), "u-1");
  });

  it("usuario con acceso → ok con UsuarioActual", async () => {
    m.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
    m.perfilConAcceso.mockResolvedValue({ rol: "remero", nombre: "Ana Pérez", atleta_id: "a-1" });
    expect(await obtenerAcceso()).toEqual({
      estado: "ok",
      usuario: { id: "u-1", nombre: "Ana Pérez", rol: "remero", atletaId: "a-1" },
    });
  });
});

describe("errores transitorios: lanzan, nunca son 'sin sesión'", () => {
  const transitorios: Array<[string, Error]> = [
    ["red caída (status 0)", new AuthRetryableFetchError("fetch failed", 0)],
    ["503 del gateway", new AuthRetryableFetchError("Service Unavailable", 503)],
    ["500 de GoTrue", new AuthApiError("Internal Server Error", 500, "unexpected_failure")],
    ["429 rate limit", new AuthApiError("Too many requests", 429, "over_request_rate_limit")],
    ["respuesta no JSON", new AuthUnknownError("Unexpected token <", null)],
  ];

  it.each(transitorios)("%s: obtenerAcceso lanza", async (_, error) => {
    m.getUser.mockResolvedValue(sinUsuario(error));
    await expect(obtenerAcceso()).rejects.toThrow(/verificar la sesión/);
    expect(m.perfilConAcceso).not.toHaveBeenCalled();
  });

  it.each(transitorios)("%s: requerirUsuario lanza SIN signOut ni redirect", async (_, error) => {
    m.getUser.mockResolvedValue(sinUsuario(error));
    await expect(requerirUsuario()).rejects.toThrow(/verificar la sesión/);
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("si falla la lectura del perfil, lanza SIN signOut ni redirect", async () => {
    m.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
    m.perfilConAcceso.mockRejectedValue(new Error("perfil: timeout"));
    await expect(requerirUsuario()).rejects.toThrow(/perfil: timeout/);
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe("requerirUsuario", () => {
  it("sin_sesion → /sin-acceso sin signOut", async () => {
    m.getUser.mockResolvedValue(sinUsuario(new AuthSessionMissingError()));
    await expect(requerirUsuario()).rejects.toThrow("NEXT_REDIRECT /sin-acceso");
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("sin_acceso → signOut y /sin-acceso, con un solo getUser", async () => {
    m.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
    m.perfilConAcceso.mockResolvedValue(null);
    await expect(requerirUsuario()).rejects.toThrow("NEXT_REDIRECT /sin-acceso");
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.getUser).toHaveBeenCalledTimes(1);
  });

  it("ok → devuelve el usuario sin signOut ni redirect", async () => {
    m.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
    m.perfilConAcceso.mockResolvedValue({ rol: "entrenador", nombre: "Coach", atleta_id: null });
    expect(await requerirUsuario()).toEqual({ id: "u-1", nombre: "Coach", rol: "entrenador", atletaId: null });
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
    expect(m.getUser).toHaveBeenCalledTimes(1);
  });
});
