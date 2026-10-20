// Criterio de salida de la fase 0 (diseño §6): las políticas RLS aíslan los
// datos de cada atleta. Usuarios reales, autenticados contra Supabase.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  asignar,
  BUCKET_CAPTURAS,
  clienteAnonimo,
  crearAtleta,
  crearSesion,
  crearUsuario,
  limpiar,
} from "./helpers";

type Usuario = { id: string; cliente: SupabaseClient };

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function sesionNueva(atletaId: string, creadoPor: string) {
  return {
    atleta_id: atletaId,
    tipo: "entrenamiento",
    fecha: new Date().toISOString(),
    distancia_m: 2000,
    tiempo_ds: 4200,
    creado_por: creadoPor,
  };
}

const RLS = "42501"; // insufficient_privilege: violación de política o permiso denegado

describe("1. remero A no ve sesiones de B", () => {
  let remeroA: Usuario;
  let atletaA: string;
  let sesionA: string;
  let sesionB: string;

  beforeAll(async () => {
    atletaA = await crearAtleta();
    const atletaB = await crearAtleta();
    remeroA = await crearUsuario({ rol: "remero", atletaId: atletaA });
    sesionA = await crearSesion(atletaA);
    sesionB = await crearSesion(atletaB);
  });
  afterAll(limpiar);

  it("sesion de B → []", async () => {
    const { data, error } = await remeroA.cliente.from("sesion").select("id").eq("id", sesionB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("v_sesion_calculada de B → []", async () => {
    const { data, error } = await remeroA.cliente.from("v_sesion_calculada").select("id").eq("id", sesionB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("sin filtro solo ve la propia, también en la vista", async () => {
    const tabla = await remeroA.cliente.from("sesion").select("id");
    expect(tabla.error).toBeNull();
    expect(tabla.data!.map((r) => r.id)).toEqual([sesionA]);
    const vista = await remeroA.cliente.from("v_sesion_calculada").select("id, watts");
    expect(vista.error).toBeNull();
    expect(vista.data!.map((r) => r.id)).toEqual([sesionA]);
    expect(vista.data![0].watts).not.toBeNull();
  });

  it("anon no ve ninguna sesión", async () => {
    const { data } = await clienteAnonimo().from("sesion").select("id").in("id", [sesionA, sesionB]);
    expect(data ?? []).toEqual([]);
  });
});

describe("2. remero solo inserta sesiones propias", () => {
  let remeroA: Usuario;
  let atletaA: string;
  let atletaB: string;

  beforeAll(async () => {
    atletaA = await crearAtleta();
    atletaB = await crearAtleta();
    remeroA = await crearUsuario({ rol: "remero", atletaId: atletaA });
  });
  afterAll(limpiar);

  it("con atleta_id de B → error", async () => {
    const { error } = await remeroA.cliente.from("sesion").insert(sesionNueva(atletaB, remeroA.id));
    expect(error?.code).toBe(RLS);
    const { count } = await admin()
      .from("sesion")
      .select("*", { count: "exact", head: true })
      .eq("atleta_id", atletaB);
    expect(count).toBe(0);
  });

  it("con creado_por de otro usuario → error", async () => {
    const otro = await crearUsuario({ rol: "remero" });
    const { error } = await remeroA.cliente.from("sesion").insert(sesionNueva(atletaA, otro.id));
    expect(error?.code).toBe(RLS);
  });

  it("con su propio atleta → ok", async () => {
    const { data, error } = await remeroA.cliente
      .from("sesion")
      .insert(sesionNueva(atletaA, remeroA.id))
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data!.id).toBeTruthy();
  });

  it("no puede mover su sesión al atleta B", async () => {
    const { data: s } = await remeroA.cliente
      .from("sesion")
      .insert(sesionNueva(atletaA, remeroA.id))
      .select("id")
      .single();
    const { error } = await remeroA.cliente.from("sesion").update({ atleta_id: atletaB }).eq("id", s!.id);
    expect(error?.code).toBe(RLS);
  });
});

describe("3. entrenador ve solo atletas asignados y vigentes", () => {
  let entrenador: Usuario;
  const atletas: Record<string, string> = {};
  const sesiones: Record<string, string> = {};

  beforeAll(async () => {
    entrenador = await crearUsuario({ rol: "entrenador" });
    for (const k of ["asignado", "noAsignado", "hastaAyer", "hastaHoy", "desdeManana"]) {
      atletas[k] = await crearAtleta();
      sesiones[k] = await crearSesion(atletas[k]);
    }
    // "hoy" se toma del propio Postgres (default current_date de desde), no del
    // reloj local: evita fallos cerca de medianoche por diferencia de zona horaria.
    const { data, error } = await admin()
      .from("asignacion_entrenador")
      .insert({ entrenador_id: entrenador.id, atleta_id: atletas.hastaHoy })
      .select("desde")
      .single();
    if (error) throw new Error(error.message);
    const hoy = data.desde as string;
    const upd = await admin()
      .from("asignacion_entrenador")
      .update({ hasta: hoy })
      .eq("entrenador_id", entrenador.id)
      .eq("atleta_id", atletas.hastaHoy);
    if (upd.error) throw new Error(upd.error.message);

    await asignar(entrenador.id, atletas.asignado, sumarDias(hoy, -30), null);
    await asignar(entrenador.id, atletas.hastaAyer, sumarDias(hoy, -30), sumarDias(hoy, -1));
    await asignar(entrenador.id, atletas.desdeManana, sumarDias(hoy, 1), null);
  });
  afterAll(limpiar);

  const ve = async (k: string) => {
    const a = await entrenador.cliente.from("atleta").select("id").eq("id", atletas[k]);
    const s = await entrenador.cliente.from("sesion").select("id").eq("id", sesiones[k]);
    expect(a.error).toBeNull();
    expect(s.error).toBeNull();
    expect(a.data!.length).toBe(s.data!.length);
    return a.data!.length === 1;
  };

  it("ve al atleta asignado y sus sesiones", async () => expect(await ve("asignado")).toBe(true));
  it("no ve al atleta no asignado", async () => expect(await ve("noAsignado")).toBe(false));
  it("asignación con hasta = ayer → no lo ve", async () => expect(await ve("hastaAyer")).toBe(false));
  it("asignación con hasta = hoy → lo ve", async () => expect(await ve("hastaHoy")).toBe(true));
  it("asignación con desde = mañana → no lo ve", async () => expect(await ve("desdeManana")).toBe(false));

  it("inserta sesión para su atleta asignado y no para el no asignado", async () => {
    const ok = await entrenador.cliente.from("sesion").insert(sesionNueva(atletas.asignado, entrenador.id));
    expect(ok.error).toBeNull();
    const no = await entrenador.cliente.from("sesion").insert(sesionNueva(atletas.noAsignado, entrenador.id));
    expect(no.error?.code).toBe(RLS);
  });

  it("solo ve sus propias asignaciones", async () => {
    const otro = await crearUsuario({ rol: "entrenador" });
    await asignar(otro.id, atletas.noAsignado);
    const { data, error } = await entrenador.cliente.from("asignacion_entrenador").select("entrenador_id");
    expect(error).toBeNull();
    expect(data!.length).toBe(4);
    expect(new Set(data!.map((r) => r.entrenador_id))).toEqual(new Set([entrenador.id]));
  });

  it("no puede asignarse atletas", async () => {
    const { error } = await entrenador.cliente
      .from("asignacion_entrenador")
      .insert({ entrenador_id: entrenador.id, atleta_id: atletas.noAsignado, desde: "2020-01-01" });
    expect(error?.code).toBe(RLS);
  });
});

describe("4. admin ve todo", () => {
  const ids: string[] = [];
  let adminU: Usuario;

  beforeAll(async () => {
    adminU = await crearUsuario({ rol: "admin" });
    for (let i = 0; i < 3; i++) ids.push(await crearSesion(await crearAtleta()));
  });
  afterAll(limpiar);

  it("ve todas las sesiones creadas en el test", async () => {
    const { data, error } = await adminU.cliente.from("sesion").select("id").in("id", ids);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id).sort()).toEqual([...ids].sort());
  });
});

describe("5. registro_acceso y enlace_acceso", () => {
  let remero: Usuario;
  let adminU: Usuario;
  let atleta: string;

  beforeAll(async () => {
    atleta = await crearAtleta();
    remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    adminU = await crearUsuario({ rol: "admin" });
    const { error } = await admin()
      .from("enlace_acceso")
      .insert({ usuario_id: remero.id, token_hash: `h-${remero.id}`, vence_en: new Date(Date.now() + 864e5).toISOString() });
    if (error) throw new Error(error.message);
  });
  afterAll(limpiar);

  it("remero lee registro_acceso y enlace_acceso → [] o error", async () => {
    for (const tabla of ["registro_acceso", "enlace_acceso"]) {
      const { data, error } = await remero.cliente.from(tabla).select("*");
      if (!error) expect(data).toEqual([]);
    }
    const enlace = await remero.cliente.from("enlace_acceso").select("*");
    expect(enlace.error?.code).toBe(RLS);
  });

  it("remero llama registrar_acceso → ok, pero sigue sin poder leerlo", async () => {
    const { error } = await remero.cliente.rpc("registrar_acceso", {
      p_atleta_id: atleta,
      p_accion: "test_rls",
      p_detalle: { origen: "rls.test" },
    });
    expect(error).toBeNull();
    const { data } = await remero.cliente.from("registro_acceso").select("*");
    expect(data ?? []).toEqual([]);
  });

  it("remero no puede insertar, modificar ni borrar directo en registro_acceso", async () => {
    const ins = await remero.cliente
      .from("registro_acceso")
      .insert({ usuario_id: remero.id, atleta_id: atleta, accion: "falso" });
    expect(ins.error?.code).toBe(RLS);
    const upd = await adminU.cliente.from("registro_acceso").update({ accion: "x" }).eq("usuario_id", remero.id);
    expect(upd.error?.code).toBe(RLS);
    const del = await adminU.cliente.from("registro_acceso").delete().eq("usuario_id", remero.id);
    expect(del.error?.code).toBe(RLS);
  });

  it("admin lee la fila registrada con usuario_id del remero", async () => {
    const { data, error } = await adminU.cliente
      .from("registro_acceso")
      .select("usuario_id, atleta_id, accion, detalle")
      .eq("usuario_id", remero.id);
    expect(error).toBeNull();
    expect(data).toEqual([
      { usuario_id: remero.id, atleta_id: atleta, accion: "test_rls", detalle: { origen: "rls.test" } },
    ]);
  });

  it("admin tampoco lee enlace_acceso (solo service role)", async () => {
    const { error } = await adminU.cliente.from("enlace_acceso").select("*");
    expect(error?.code).toBe(RLS);
  });

  it("anon no puede llamar registrar_acceso", async () => {
    const { error } = await clienteAnonimo().rpc("registrar_acceso", { p_atleta_id: atleta, p_accion: "anon" });
    expect(error).not.toBeNull();
    const { count } = await admin()
      .from("registro_acceso")
      .select("*", { count: "exact", head: true })
      .eq("accion", "anon");
    expect(count).toBe(0);
  });
});

describe("6. consentimiento y atleta activo bloquean la carga", () => {
  let revocado: string;
  let inactivo: string;
  let remeroRevocado: Usuario;
  let remeroInactivo: Usuario;
  let entrenador: Usuario;

  beforeAll(async () => {
    revocado = await crearAtleta();
    const { error } = await admin()
      .from("consentimiento")
      .update({ revocado_en: new Date().toISOString() })
      .eq("atleta_id", revocado);
    if (error) throw new Error(error.message);
    inactivo = await crearAtleta({ activo: false });
    remeroRevocado = await crearUsuario({ rol: "remero", atletaId: revocado });
    remeroInactivo = await crearUsuario({ rol: "remero", atletaId: inactivo });
    entrenador = await crearUsuario({ rol: "entrenador" });
    await asignar(entrenador.id, revocado, "2020-01-01");
    await asignar(entrenador.id, inactivo, "2020-01-01");
  });
  afterAll(limpiar);

  it("inserta sesion para atleta con consentimiento revocado → error", async () => {
    const r = await remeroRevocado.cliente.from("sesion").insert(sesionNueva(revocado, remeroRevocado.id));
    expect(r.error?.code).toBe(RLS);
    const e = await entrenador.cliente.from("sesion").insert(sesionNueva(revocado, entrenador.id));
    expect(e.error?.code).toBe(RLS);
  });

  it("inserta sesion para atleta activo = false → error", async () => {
    const r = await remeroInactivo.cliente.from("sesion").insert(sesionNueva(inactivo, remeroInactivo.id));
    expect(r.error?.code).toBe(RLS);
    const e = await entrenador.cliente.from("sesion").insert(sesionNueva(inactivo, entrenador.id));
    expect(e.error?.code).toBe(RLS);
  });
});

describe("7. split sigue a la sesión", () => {
  let remeroA: Usuario;
  let sesionA: string;
  let sesionB: string;

  beforeAll(async () => {
    const atletaA = await crearAtleta();
    remeroA = await crearUsuario({ rol: "remero", atletaId: atletaA });
    sesionA = await crearSesion(atletaA);
    sesionB = await crearSesion(await crearAtleta());
    const { error } = await admin()
      .from("split")
      .insert([
        { sesion_id: sesionA, orden: 1, distancia_m: 500, tiempo_ds: 1050 },
        { sesion_id: sesionB, orden: 1, distancia_m: 500, tiempo_ds: 1050 },
      ]);
    if (error) throw new Error(error.message);
  });
  afterAll(limpiar);

  it("remero lee split de una sesión ajena → []", async () => {
    const { data, error } = await remeroA.cliente.from("split").select("id").eq("sesion_id", sesionB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("remero lee split de su sesión", async () => {
    const { data, error } = await remeroA.cliente.from("split").select("id").eq("sesion_id", sesionA);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("remero no inserta split en una sesión ajena, sí en la propia", async () => {
    const no = await remeroA.cliente.from("split").insert({ sesion_id: sesionB, orden: 2, tiempo_ds: 1000 });
    expect(no.error?.code).toBe(RLS);
    const si = await remeroA.cliente.from("split").insert({ sesion_id: sesionA, orden: 2, tiempo_ds: 1000 });
    expect(si.error).toBeNull();
  });
});

describe("8. consentimiento: el remero no lo lee, el entrenador asignado sí", () => {
  let remero: Usuario;
  let entrenador: Usuario;
  let atleta: string;

  beforeAll(async () => {
    atleta = await crearAtleta();
    remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    entrenador = await crearUsuario({ rol: "entrenador" });
    await asignar(entrenador.id, atleta, "2020-01-01");
  });
  afterAll(limpiar);

  it("remero no puede leer consentimiento propio", async () => {
    const { data, error } = await remero.cliente.from("consentimiento").select("id").eq("atleta_id", atleta);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("entrenador asignado sí", async () => {
    const { data, error } = await entrenador.cliente.from("consentimiento").select("id").eq("atleta_id", atleta);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("remero no puede revocar ni crear consentimiento", async () => {
    const ins = await remero.cliente.from("consentimiento").insert({
      atleta_id: atleta,
      otorgado_por_nombre: "Yo",
      relacion: "propio",
      medio: "digital",
      version_texto: "v1",
      otorgado_en: "2026-01-01",
    });
    expect(ins.error?.code).toBe(RLS);
  });

  it("remero ve su perfil y el entrenador el del remero asignado", async () => {
    const propio = await remero.cliente.from("perfil").select("user_id");
    expect(propio.data!.map((r) => r.user_id)).toEqual([remero.id]);
    const delEntrenador = await entrenador.cliente.from("perfil").select("user_id").eq("user_id", remero.id);
    expect(delEntrenador.data!.length).toBe(1);
  });

  it("remero no puede cambiarse de rol", async () => {
    await remero.cliente.from("perfil").update({ rol: "admin" }).eq("user_id", remero.id);
    const { data } = await admin().from("perfil").select("rol").eq("user_id", remero.id).single();
    expect(data!.rol).toBe("remero");
  });
});

describe("9. storage: cada usuario sube solo a su carpeta de capturas", () => {
  let remero: Usuario;
  let otro: Usuario;
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  beforeAll(async () => {
    remero = await crearUsuario({ rol: "remero", atletaId: await crearAtleta() });
    otro = await crearUsuario({ rol: "remero", atletaId: await crearAtleta() });
  });
  afterAll(limpiar);

  it("remero sube a capturas/<otro_uid>/x.jpg → error", async () => {
    const { data, error } = await remero.cliente.storage
      .from(BUCKET_CAPTURAS)
      .upload(`${otro.id}/x.jpg`, jpg, { contentType: "image/jpeg" });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("a capturas/<su_uid>/x.jpg → ok, y el otro no puede leerla", async () => {
    const { error } = await remero.cliente.storage
      .from(BUCKET_CAPTURAS)
      .upload(`${remero.id}/x.jpg`, jpg, { contentType: "image/jpeg" });
    expect(error).toBeNull();
    const propia = await remero.cliente.storage.from(BUCKET_CAPTURAS).download(`${remero.id}/x.jpg`);
    expect(propia.error).toBeNull();
    const ajena = await otro.cliente.storage.from(BUCKET_CAPTURAS).download(`${remero.id}/x.jpg`);
    expect(ajena.error).not.toBeNull();
  });

  it("el bucket es privado", async () => {
    const { data, error } = await admin().storage.getBucket(BUCKET_CAPTURAS);
    expect(error).toBeNull();
    expect(data!.public).toBe(false);
  });

  it("captura ajena no es visible", async () => {
    const { data: c, error } = await otro.cliente
      .from("captura")
      .insert({ storage_path: `${otro.id}/y.jpg`, subida_por: otro.id })
      .select("id")
      .single();
    expect(error).toBeNull();
    const ajena = await remero.cliente.from("captura").select("id").eq("id", c!.id);
    expect(ajena.data).toEqual([]);
    const falsa = await remero.cliente.from("captura").insert({ storage_path: "z", subida_por: otro.id });
    expect(falsa.error?.code).toBe(RLS);
  });
});

describe("10. atleta: sin insert directo", () => {
  let remero: Usuario;
  let entrenador: Usuario;

  beforeAll(async () => {
    remero = await crearUsuario({ rol: "remero", atletaId: await crearAtleta() });
    entrenador = await crearUsuario({ rol: "entrenador" });
  });
  afterAll(limpiar);

  it("remero intenta insert directo en atleta → error", async () => {
    const { error } = await remero.cliente.from("atleta").insert({ nombre: "X", apellido: "Intruso" });
    expect(error?.code).toBe(RLS);
  });

  it("entrenador tampoco (se crea vía RPC con consentimiento, Task 5)", async () => {
    const { error } = await entrenador.cliente.from("atleta").insert({ nombre: "X", apellido: "Intruso" });
    expect(error?.code).toBe(RLS);
    const { count } = await admin()
      .from("atleta")
      .select("*", { count: "exact", head: true })
      .eq("apellido", "Intruso");
    expect(count).toBe(0);
  });

  it("remero no edita su propia ficha", async () => {
    const { data: p } = await admin().from("perfil").select("atleta_id").eq("user_id", remero.id).single();
    await remero.cliente.from("atleta").update({ nombre: "Cambiado" }).eq("id", p!.atleta_id);
    const { data } = await admin().from("atleta").select("nombre").eq("id", p!.atleta_id).single();
    expect(data!.nombre).toBe("Test");
  });
});
