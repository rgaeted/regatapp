import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { resolverEnlace } from "@/lib/acceso/enlace";
import { admin, crearAtleta, limpiar, registrarUsuario } from "./helpers";

// limpiar() también borra el registro_acceso de los enlaces generados por los
// scripts (creado_por null): lo encuentra por detalle.usuario_objetivo.
afterAll(limpiar);

const PATRON_URL = /^https?:\/\/.*\/entrar\?t=[A-Za-z0-9_-]+$/;

function correr(script: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, ["--import", "tsx", `scripts/${script}.ts`, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 60000,
  });
  return { codigo: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function sinSecretos(salida: string) {
  expect(salida).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  expect(salida).not.toContain("eyJ");
}

const tokenDe = (url: string) => new URL(url).searchParams.get("t") as string;

describe("scripts de acceso", () => {
  it("enlace-atleta imprime una sola URL válida para un atleta con consentimiento", async () => {
    const atletaId = await crearAtleta();
    const r = correr("enlace-atleta", ["--atleta", atletaId]);
    const { data: a } = await admin().from("atleta").select("user_id").eq("id", atletaId).single();
    if (a?.user_id) registrarUsuario(a.user_id as string);
    expect(r.codigo).toBe(0);
    const lineas = r.stdout.trim().split(/\r?\n/);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatch(PATRON_URL);
    sinSecretos(r.stdout);
    sinSecretos(r.stderr);

    expect((await resolverEnlace(admin(), tokenDe(lineas[0]))).ok).toBe(true);
  });

  it("enlace-atleta falla sin imprimir nada en stdout si el consentimiento está revocado", async () => {
    const atletaId = await crearAtleta();
    await admin().from("consentimiento").update({ revocado_en: new Date().toISOString() }).eq("atleta_id", atletaId);
    const r = correr("enlace-atleta", ["--atleta", atletaId]);
    // El usuario puede haberse creado antes del rechazo: registrarlo para limpiar.
    const { data: a } = await admin().from("atleta").select("user_id").eq("id", atletaId).single();
    if (a?.user_id) registrarUsuario(a.user_id as string);
    expect(r.codigo).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("acceso vigente");
    sinSecretos(r.stderr);
  });

  it("enlace-atleta rechaza un uuid inválido y banderas desconocidas", () => {
    for (const args of [["--atleta", "no-es-uuid"], [], ["--atleta", "x", "--otra", "y"]]) {
      const r = correr("enlace-atleta", args);
      expect(r.codigo).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("Uso:");
    }
  });

  it("falla con mensaje claro si falta una variable, sin revelar valores", () => {
    const r = correr("enlace-atleta", ["--atleta", "00000000-0000-4000-8000-0000000000a1"], {
      ENV_FILE: "no-existe.env",
      NEXT_PUBLIC_SITE_URL: "",
    });
    expect(r.codigo).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("NEXT_PUBLIC_SITE_URL");
    sinSecretos(r.stderr);
  });

  it("crear-admin imprime una URL, crea un admin y el enlace resuelve", async () => {
    const r = correr("crear-admin", ["--nombre", "Admin Prueba"], {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      // El proyecto dev es remoto por diseño: sin esto el guardia lo rechazaría.
      CONFIRMAR_PRODUCCION: "1",
    });
    const lineas = r.stdout.trim().split(/\r?\n/);
    const { data: fila } = lineas[0]
      ? await admin().from("enlace_acceso").select("usuario_id").eq("token_hash", tokenDe(lineas[0])).maybeSingle()
      : { data: null };
    if (fila) registrarUsuario(fila.usuario_id as string);

    expect(r.codigo, r.stderr.replace(/eyJ[\w.-]+/g, "<jwt>")).toBe(0);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatch(PATRON_URL);
    sinSecretos(r.stdout);
    sinSecretos(r.stderr);
    expect(fila).not.toBeNull();
    const { data: perfil } = await admin().from("perfil").select("rol,nombre").eq("user_id", fila!.usuario_id).single();
    expect(perfil).toEqual({ rol: "admin", nombre: "Admin Prueba" });
    expect((await resolverEnlace(admin(), tokenDe(lineas[0]))).ok).toBe(true);
  });

  it("crear-admin se niega si el sitio no es local y no hay CONFIRMAR_PRODUCCION", () => {
    const r = correr("crear-admin", ["--nombre", "X"], {
      NEXT_PUBLIC_SITE_URL: "https://staging.ejemplo.cl",
      CONFIRMAR_PRODUCCION: "",
    });
    expect(r.codigo).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("CONFIRMAR_PRODUCCION");
  });

  describe("guardia de entorno de crear-admin", () => {
    async function usuarios(): Promise<number> {
      const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 1000 });
      return data?.users.length ?? -1;
    }

    it("rechaza Supabase remoto con sitio localhost y no crea ningún usuario", async () => {
      const antes = await usuarios();
      // El Supabase de la corrida puede ser local (CI): se fuerza uno remoto en el entorno del script.
      const r = correr("crear-admin", ["--nombre", "Admin Guardia"], {
        NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        CONFIRMAR_PRODUCCION: "",
      });
      expect(r.codigo).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(r.stderr).not.toContain("NEXT_PUBLIC_SITE_URL");
      sinSecretos(r.stderr);
      expect(await usuarios()).toBe(antes);
      const { count } = await admin().from("perfil").select("*", { count: "exact", head: true }).eq("nombre", "Admin Guardia");
      expect(count).toBe(0);
    });

    it("rechaza ambas URL remotas sin la bandera", () => {
      const r = correr("crear-admin", ["--nombre", "X"], {
        NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co",
        NEXT_PUBLIC_SITE_URL: "https://staging.ejemplo.cl",
        CONFIRMAR_PRODUCCION: "",
      });
      expect(r.codigo).toBe(1);
      expect(r.stderr).toContain("NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SITE_URL");
    });

    it.each(["http://localhost.evil.com", "http://localhost@evil.com"])(
      "rechaza %s en cualquiera de las dos variables antes de conectarse",
      (falso) => {
        const casos: Array<Record<string, string>> = [
          { NEXT_PUBLIC_SUPABASE_URL: falso, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
          { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SITE_URL: falso },
        ];
        for (const env of casos) {
          const r = correr("crear-admin", ["--nombre", "X"], { ...env, CONFIRMAR_PRODUCCION: "" });
          expect(r.codigo).toBe(1);
          expect(r.stdout).toBe("");
          expect(r.stderr).toContain("no apunta(n) a un host local");
          expect(r.stderr).not.toMatch(/fetch|ENOTFOUND|ECONN/i);
        }
      },
    );
  });
});
