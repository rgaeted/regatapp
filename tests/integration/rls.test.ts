// Criterio de salida de la fase 0 (diseño §6): las políticas RLS aíslan los
// datos de cada atleta. Usuarios reales, autenticados contra Supabase.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  asignar,
  BUCKET_CAPTURAS,
  clienteAnonimo,
  consultaCatalogo,
  consultaRest,
  crearAtleta,
  crearSesion,
  crearUsuario,
  limpiar,
  olvidarUsuario,
  puedeConsultarCatalogo,
  registrarCaptura,
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

async function hoySantiago(): Promise<string> {
  const { data, error } = await admin().rpc("hoy_santiago");
  if (error) throw new Error(`hoy_santiago: ${error.message}`);
  return data as string;
}

describe("1. remero A no ve sesiones de B", () => {
  let remeroA: Usuario;
  let atletaA: string;
  let atletaB: string;
  let sesionA: string;
  let sesionB: string;

  beforeAll(async () => {
    atletaA = await crearAtleta();
    atletaB = await crearAtleta();
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

  it("atleta de B → [] sin error", async () => {
    const { data, error } = await remeroA.cliente.from("atleta").select("id").eq("id", atletaB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const propio = await remeroA.cliente.from("atleta").select("id");
    expect(propio.error).toBeNull();
    expect(propio.data!.map((r) => r.id)).toEqual([atletaA]);
  });

  it("anon no ve ninguna sesión", async () => {
    const { data, error } = await clienteAnonimo().from("sesion").select("id").in("id", [sesionA, sesionB]);
    expect(error).toBeNull();
    expect(data).toEqual([]);
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
    // "hoy" sale de la misma expresión que usa entrena_a (fecha de Santiago en
    // Postgres), no del reloj local: evita fallos cerca de medianoche.
    const hoy = await hoySantiago();
    await asignar(entrenador.id, atletas.hastaHoy, hoy, hoy);
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

  it("remero lee registro_acceso → [] y enlace_acceso → permiso denegado", async () => {
    const registro = await remero.cliente.from("registro_acceso").select("*");
    expect(registro.error).toBeNull();
    expect(registro.data).toEqual([]);
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
    const lectura = await remero.cliente.from("registro_acceso").select("*");
    expect(lectura.error).toBeNull();
    expect(lectura.data).toEqual([]);
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
    expect(data).toBeNull();
    expect(error?.message).toMatch(/row-level security policy/i);
    expect((error as unknown as { statusCode?: string }).statusCode).toBe("403");
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

describe("11. vigencia de asignaciones en hora de Santiago", () => {
  let entrenador: Usuario;
  let manana: string;
  let ayer: string;

  beforeAll(async () => {
    entrenador = await crearUsuario({ rol: "entrenador" });
    manana = await crearAtleta();
    ayer = await crearAtleta();
    const hoy = await hoySantiago();
    await asignar(entrenador.id, manana, sumarDias(hoy, 1), null);
    await asignar(entrenador.id, ayer, sumarDias(hoy, -30), sumarDias(hoy, -1));
  });
  afterAll(limpiar);

  it("hoy_santiago() es la fecha civil de America/Santiago", async () => {
    // Ambas lecturas dentro del it: leer "hoy" en beforeAll falla cerca de medianoche.
    const hoy = await hoySantiago();
    const local = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    expect(hoy).toBe(local);
  });

  it("desde por defecto de asignacion_entrenador es hoy en Santiago", async () => {
    const otro = await crearUsuario({ rol: "entrenador" });
    const { data, error } = await admin()
      .from("asignacion_entrenador")
      .insert({ entrenador_id: otro.id, atleta_id: ayer })
      .select("desde")
      .single();
    expect(error).toBeNull();
    expect(data!.desde).toBe(await hoySantiago());
  });

  // Un cliente puede pedir otra zona horaria a PostgREST; entrena_a no debe depender de ella.
  it.each(["Pacific/Kiritimati", "Etc/GMT+12"])(
    "con Prefer: timezone=%s sigue sin ver desde = mañana ni hasta = ayer",
    async (tz) => {
      const r = await consultaRest(entrenador.cliente, `atleta?select=id&id=in.(${manana},${ayer})`, {
        Prefer: `timezone=${tz}`,
      });
      expect(r.status).toBe(200);
      expect(r.body).toEqual([]);
    },
  );
});

describe("12. sesion.captura_id solo apunta a capturas propias", () => {
  let remeroA: Usuario;
  let remeroB: Usuario;
  let atletaA: string;
  let capturaA: string;
  let capturaB: string;
  let sesionA: string;

  const subir = async (u: Usuario) => {
    const { data, error } = await u.cliente
      .from("captura")
      .insert({ storage_path: `${u.id}/${Math.random()}.jpg`, subida_por: u.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  beforeAll(async () => {
    atletaA = await crearAtleta();
    remeroA = await crearUsuario({ rol: "remero", atletaId: atletaA });
    remeroB = await crearUsuario({ rol: "remero", atletaId: await crearAtleta() });
    capturaA = await subir(remeroA);
    capturaB = await subir(remeroB);
    const { data, error } = await remeroA.cliente
      .from("sesion")
      .insert(sesionNueva(atletaA, remeroA.id))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sesionA = data.id as string;
  });
  afterAll(limpiar);

  it("A no inserta una sesión que referencia la captura de B", async () => {
    const { error } = await remeroA.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atletaA, remeroA.id), captura_id: capturaB });
    expect(error?.code).toBe(RLS);
  });

  it("A no actualiza su sesión para apuntar a la captura de B", async () => {
    const { error } = await remeroA.cliente.from("sesion").update({ captura_id: capturaB }).eq("id", sesionA);
    expect(error?.code).toBe(RLS);
  });

  it("A sigue sin leer ni apropiarse de la captura de B", async () => {
    const { data, error } = await remeroA.cliente.from("captura").select("id").eq("id", capturaB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    await remeroA.cliente.from("captura").update({ subida_por: remeroA.id }).eq("id", capturaB);
    const { data: c } = await admin().from("captura").select("subida_por").eq("id", capturaB).single();
    expect(c!.subida_por).toBe(remeroB.id);
  });

  it("A sí vincula su propia captura y edita la sesión sin cambiarla", async () => {
    const vincular = await remeroA.cliente.from("sesion").update({ captura_id: capturaA }).eq("id", sesionA);
    expect(vincular.error).toBeNull();
    const editar = await remeroA.cliente.from("sesion").update({ notas: "ok" }).eq("id", sesionA);
    expect(editar.error).toBeNull();
    const nueva = await remeroA.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atletaA, remeroA.id), captura_id: capturaA });
    expect(nueva.error).toBeNull();
  });

  it("subida_por de una captura no se puede cambiar", async () => {
    const { error } = await remeroA.cliente.from("captura").update({ subida_por: remeroB.id }).eq("id", capturaA);
    expect(error?.code).toBe(RLS);
    const { data: c } = await admin().from("captura").select("subida_por").eq("id", capturaA).single();
    expect(c!.subida_por).toBe(remeroA.id);
  });
});

describe("13. atleta.user_id y concept2_user_id solo los cambia el servidor", () => {
  let entrenador: Usuario;
  let adminU: Usuario;
  let atleta: string;

  beforeAll(async () => {
    atleta = await crearAtleta();
    entrenador = await crearUsuario({ rol: "entrenador" });
    adminU = await crearUsuario({ rol: "admin" });
    await asignar(entrenador.id, atleta, "2020-01-01");
  });
  afterAll(limpiar);

  const fila = async () => {
    const { data } = await admin()
      .from("atleta")
      .select("nombre, user_id, concept2_user_id")
      .eq("id", atleta)
      .single();
    return data!;
  };

  it("entrenador no cambia user_id", async () => {
    const { error } = await entrenador.cliente.from("atleta").update({ user_id: adminU.id }).eq("id", atleta);
    expect(error?.code).toBe(RLS);
    expect((await fila()).user_id).toBeNull();
  });

  it("entrenador no cambia concept2_user_id", async () => {
    const { error } = await entrenador.cliente.from("atleta").update({ concept2_user_id: "999" }).eq("id", atleta);
    expect(error?.code).toBe(RLS);
    expect((await fila()).concept2_user_id).toBeNull();
  });

  it("admin con su JWT tampoco", async () => {
    const { error } = await adminU.cliente.from("atleta").update({ user_id: adminU.id }).eq("id", atleta);
    expect(error?.code).toBe(RLS);
    expect((await fila()).user_id).toBeNull();
  });

  it("entrenador sí cambia nombre", async () => {
    const { error } = await entrenador.cliente.from("atleta").update({ nombre: "Renombrado" }).eq("id", atleta);
    expect(error).toBeNull();
    expect((await fila()).nombre).toBe("Renombrado");
  });

  it("service role sí cambia user_id", async () => {
    const remero = await crearUsuario({ rol: "remero" });
    const { error } = await admin().from("atleta").update({ user_id: remero.id }).eq("id", atleta);
    expect(error).toBeNull();
    expect((await fila()).user_id).toBe(remero.id);
  });
});

describe("14. concept2_result_id y origen api_concept2 solo desde el servidor", () => {
  let remero: Usuario;
  let atleta: string;
  let sesion: string;
  const idC2 = () => 9_000_000_000_000 + Math.floor(Math.random() * 1_000_000_000);

  beforeAll(async () => {
    atleta = await crearAtleta();
    remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    const { data, error } = await remero.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atleta, remero.id), origen: "manual", verificado: true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sesion = data.id as string;
  });
  afterAll(limpiar);

  it("inserta con concept2_result_id → error", async () => {
    const { error } = await remero.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atleta, remero.id), concept2_result_id: idC2() });
    expect(error?.code).toBe(RLS);
  });

  it("inserta con origen api_concept2 → error", async () => {
    const { error } = await remero.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atleta, remero.id), origen: "api_concept2", verificado: true });
    expect(error?.code).toBe(RLS);
  });

  it("actualiza para fijar concept2_result_id u origen api_concept2 → error", async () => {
    const a = await remero.cliente.from("sesion").update({ concept2_result_id: idC2() }).eq("id", sesion);
    expect(a.error?.code).toBe(RLS);
    const b = await remero.cliente.from("sesion").update({ origen: "api_concept2" }).eq("id", sesion);
    expect(b.error?.code).toBe(RLS);
    const { data } = await admin().from("sesion").select("origen, concept2_result_id").eq("id", sesion).single();
    expect(data).toEqual({ origen: "manual", concept2_result_id: null });
  });

  it("la carga manual verificada sigue funcionando", async () => {
    const { error } = await remero.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atleta, remero.id), origen: "manual", verificado: true });
    expect(error).toBeNull();
  });

  it("service role sí fija concept2_result_id", async () => {
    const id = idC2();
    const { error } = await admin()
      .from("sesion")
      .update({ concept2_result_id: id, origen: "api_concept2" })
      .eq("id", sesion);
    expect(error).toBeNull();
    const { data } = await admin().from("sesion").select("concept2_result_id").eq("id", sesion).single();
    expect(Number(data!.concept2_result_id)).toBe(id);
  });

  it("una sesión importada sigue editable en otros campos por el remero", async () => {
    const { error } = await remero.cliente.from("sesion").update({ rpe: 7 }).eq("id", sesion);
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Endurecimiento final (migración 000005)
// ---------------------------------------------------------------------------

const cuenta = async (tabla: string, filtro: Record<string, string>) => {
  let q = admin().from(tabla).select("*", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filtro)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count;
};

describe("15. borrar usuarios y atletas no choca con las FK", () => {
  afterAll(limpiar);

  it("borrar el usuario de un remero que creó sesiones y capturas funciona", async () => {
    const atleta = await crearAtleta();
    const remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    const { data: c, error: ec } = await remero.cliente
      .from("captura")
      .insert({ storage_path: `${remero.id}/f.jpg`, subida_por: remero.id })
      .select("id")
      .single();
    expect(ec).toBeNull();
    registrarCaptura(c!.id);
    const { data: s, error: es } = await remero.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atleta, remero.id), captura_id: c!.id })
      .select("id")
      .single();
    expect(es).toBeNull();

    const { error } = await admin().auth.admin.deleteUser(remero.id);
    expect(error).toBeNull();
    olvidarUsuario(remero.id);

    const { data: sesion } = await admin().from("sesion").select("creado_por, captura_id").eq("id", s!.id).single();
    expect(sesion).toEqual({ creado_por: null, captura_id: c!.id });
    const { data: cap } = await admin().from("captura").select("subida_por").eq("id", c!.id).single();
    expect(cap).toEqual({ subida_por: null });
    expect(await cuenta("perfil", { user_id: remero.id })).toBe(0);
  });

  it("borrar el usuario de un entrenador que registró consentimientos y generó enlaces funciona", async () => {
    const atleta = await crearAtleta();
    const remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    const entrenador = await crearUsuario({ rol: "entrenador" });
    await asignar(entrenador.id, atleta, "2020-01-01");
    const { data: cons, error: ec } = await entrenador.cliente
      .from("consentimiento")
      .insert({
        atleta_id: atleta,
        otorgado_por_nombre: "Apoderado 2",
        relacion: "apoderado",
        medio: "papel",
        version_texto: "v1",
        otorgado_en: "2026-01-01",
        registrado_por: entrenador.id,
      })
      .select("id")
      .single();
    expect(ec).toBeNull();
    const token = `h-${entrenador.id}`;
    const { error: el } = await admin().from("enlace_acceso").insert({
      usuario_id: remero.id,
      token_hash: token,
      creado_por: entrenador.id,
      vence_en: new Date(Date.now() + 864e5).toISOString(),
    });
    expect(el).toBeNull();

    const { error } = await admin().auth.admin.deleteUser(entrenador.id);
    expect(error).toBeNull();
    olvidarUsuario(entrenador.id);

    const { data: c } = await admin().from("consentimiento").select("registrado_por").eq("id", cons!.id).single();
    expect(c).toEqual({ registrado_por: null });
    const { data: e } = await admin().from("enlace_acceso").select("creado_por").eq("token_hash", token).single();
    expect(e).toEqual({ creado_por: null });
    expect(await cuenta("asignacion_entrenador", { entrenador_id: entrenador.id })).toBe(0);
  });

  it("borrar un atleta que tiene perfil de remero funciona y suelta el perfil", async () => {
    const atleta = await crearAtleta();
    const remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    await crearSesion(atleta, { creado_por: remero.id });

    const { error } = await admin().from("atleta").delete().eq("id", atleta);
    expect(error).toBeNull();

    expect(await cuenta("atleta", { id: atleta })).toBe(0);
    expect(await cuenta("sesion", { atleta_id: atleta })).toBe(0);
    const { data: p } = await admin().from("perfil").select("rol, atleta_id").eq("user_id", remero.id).single();
    expect(p).toEqual({ rol: "remero", atleta_id: null });
  });
});

describe("16. entrena_a exige perfil de entrenador vigente", () => {
  let atleta: string;
  let sesion: string;

  beforeAll(async () => {
    atleta = await crearAtleta();
    sesion = await crearSesion(atleta);
  });
  afterAll(limpiar);

  const ve = async (u: Usuario) => {
    const a = await u.cliente.from("atleta").select("id").eq("id", atleta);
    const s = await u.cliente.from("sesion").select("id").eq("id", sesion);
    const c = await u.cliente.from("consentimiento").select("id").eq("atleta_id", atleta);
    expect(a.error).toBeNull();
    expect(s.error).toBeNull();
    expect(c.error).toBeNull();
    return [a.data!.length, s.data!.length, c.data!.length];
  };

  it("un entrenador degradado a remero pierde el acceso de inmediato", async () => {
    const entrenador = await crearUsuario({ rol: "entrenador" });
    await asignar(entrenador.id, atleta, "2020-01-01");
    expect(await ve(entrenador)).toEqual([1, 1, 1]);
    const { error } = await admin().from("perfil").update({ rol: "remero" }).eq("user_id", entrenador.id);
    expect(error).toBeNull();
    // Mismo cliente y mismo JWT: la asignación sigue, el rol no.
    expect(await ve(entrenador)).toEqual([0, 0, 0]);
    const ins = await entrenador.cliente.from("sesion").insert(sesionNueva(atleta, entrenador.id));
    expect(ins.error?.code).toBe(RLS);
    expect(await cuenta("sesion", { atleta_id: atleta, creado_por: entrenador.id })).toBe(0);
  });

  it("un entrenador sin perfil pierde el acceso de inmediato", async () => {
    const entrenador = await crearUsuario({ rol: "entrenador" });
    await asignar(entrenador.id, atleta, "2020-01-01");
    expect(await ve(entrenador)).toEqual([1, 1, 1]);
    const { error } = await admin().from("perfil").delete().eq("user_id", entrenador.id);
    expect(error).toBeNull();
    expect(await ve(entrenador)).toEqual([0, 0, 0]);
  });
});

describe("17. entrenador con asignación vencida no lee nada del atleta", () => {
  let vencido: Usuario;
  let vigente: Usuario;
  let atleta: string;
  let remero: Usuario;
  let sesion: string;
  let captura: string;

  beforeAll(async () => {
    atleta = await crearAtleta();
    remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    const { data: c, error: ec } = await remero.cliente
      .from("captura")
      .insert({ storage_path: `${remero.id}/v.jpg`, subida_por: remero.id })
      .select("id")
      .single();
    if (ec) throw new Error(ec.message);
    captura = c.id as string;
    const { data: s, error: es } = await remero.cliente
      .from("sesion")
      .insert({ ...sesionNueva(atleta, remero.id), captura_id: captura })
      .select("id")
      .single();
    if (es) throw new Error(es.message);
    sesion = s.id as string;
    const { error } = await admin().from("split").insert({ sesion_id: sesion, orden: 1, tiempo_ds: 1000 });
    if (error) throw new Error(error.message);
    const hoy = await hoySantiago();
    vencido = await crearUsuario({ rol: "entrenador" });
    vigente = await crearUsuario({ rol: "entrenador" });
    await asignar(vencido.id, atleta, sumarDias(hoy, -30), sumarDias(hoy, -1));
    await asignar(vigente.id, atleta, sumarDias(hoy, -30), null);
  });
  afterAll(limpiar);

  const lee = async (u: Usuario) => {
    const consultas = await Promise.all([
      u.cliente.from("split").select("id").eq("sesion_id", sesion),
      u.cliente.from("captura").select("id").eq("id", captura),
      u.cliente.from("consentimiento").select("id").eq("atleta_id", atleta),
      u.cliente.from("perfil").select("user_id").eq("user_id", remero.id),
    ]);
    return consultas.map((r) => {
      expect(r.error).toBeNull();
      return r.data!.length;
    });
  };

  it("control: con asignación vigente ve split, captura, consentimiento y perfil", async () => {
    expect(await lee(vigente)).toEqual([1, 1, 1, 1]);
  });

  it("con asignación vencida recibe [] en las cuatro tablas", async () => {
    expect(await lee(vencido)).toEqual([0, 0, 0, 0]);
  });
});

describe("18. split exige consentimiento vigente y atleta activo", () => {
  let remeroRev: Usuario;
  let remeroInact: Usuario;
  let entrenador: Usuario;
  let sesionRev: string;
  let sesionInact: string;
  let splitRev: string;
  let splitInact: string;

  const splitDe = async (sesion: string) => {
    const { data, error } = await admin()
      .from("split")
      .insert({ sesion_id: sesion, orden: 1, tiempo_ds: 1000 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  beforeAll(async () => {
    const revocado = await crearAtleta();
    const inactivo = await crearAtleta();
    remeroRev = await crearUsuario({ rol: "remero", atletaId: revocado });
    remeroInact = await crearUsuario({ rol: "remero", atletaId: inactivo });
    entrenador = await crearUsuario({ rol: "entrenador" });
    await asignar(entrenador.id, revocado, "2020-01-01");
    await asignar(entrenador.id, inactivo, "2020-01-01");
    sesionRev = await crearSesion(revocado);
    sesionInact = await crearSesion(inactivo);
    splitRev = await splitDe(sesionRev);
    splitInact = await splitDe(sesionInact);
    const r1 = await admin()
      .from("consentimiento")
      .update({ revocado_en: new Date().toISOString() })
      .eq("atleta_id", revocado);
    const r2 = await admin().from("atleta").update({ activo: false }).eq("id", inactivo);
    if (r1.error || r2.error) throw new Error(`setup: ${r1.error?.message ?? r2.error?.message}`);
  });
  afterAll(limpiar);

  it.each([
    ["consentimiento revocado", () => [remeroRev, sesionRev] as const],
    ["atleta inactivo", () => [remeroInact, sesionInact] as const],
  ])("%s: ni el remero ni el entrenador insertan splits", async (_, datos) => {
    const [remero, sesion] = datos();
    for (const u of [remero, entrenador]) {
      const { error } = await u.cliente.from("split").insert({ sesion_id: sesion, orden: 2, tiempo_ds: 900 });
      expect(error?.code).toBe(RLS);
    }
    expect(await cuenta("split", { sesion_id: sesion })).toBe(1);
  });

  it.each([
    ["consentimiento revocado", () => [remeroRev, splitRev] as const],
    ["atleta inactivo", () => [remeroInact, splitInact] as const],
  ])("%s: ni el remero ni el entrenador modifican splits", async (_, datos) => {
    const [remero, split] = datos();
    for (const u of [remero, entrenador]) {
      const { error } = await u.cliente.from("split").update({ tiempo_ds: 1 }).eq("id", split);
      expect(error?.code).toBe(RLS);
    }
    const { data } = await admin().from("split").select("tiempo_ds").eq("id", split).single();
    expect(data).toEqual({ tiempo_ds: 1000 });
  });
});

describe("19. sesion.creado_por no se puede cambiar desde el cliente", () => {
  let remero: Usuario;
  let otro: Usuario;
  let sesion: string;

  beforeAll(async () => {
    const atleta = await crearAtleta();
    remero = await crearUsuario({ rol: "remero", atletaId: atleta });
    otro = await crearUsuario({ rol: "entrenador" });
    const { data, error } = await remero.cliente
      .from("sesion")
      .insert(sesionNueva(atleta, remero.id))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sesion = data.id as string;
  });
  afterAll(limpiar);

  const creadoPor = async () =>
    (await admin().from("sesion").select("creado_por").eq("id", sesion).single()).data!.creado_por;

  it("a otro usuario → error", async () => {
    const { error } = await remero.cliente.from("sesion").update({ creado_por: otro.id }).eq("id", sesion);
    expect(error?.code).toBe(RLS);
    expect(await creadoPor()).toBe(remero.id);
  });

  it("a null → error", async () => {
    const { error } = await remero.cliente.from("sesion").update({ creado_por: null }).eq("id", sesion);
    expect(error?.code).toBe(RLS);
    expect(await creadoPor()).toBe(remero.id);
  });

  it("editar otros campos sigue permitido", async () => {
    const { error } = await remero.cliente.from("sesion").update({ notas: "ok" }).eq("id", sesion);
    expect(error).toBeNull();
  });

  it("el service role sí puede", async () => {
    const { error } = await admin().from("sesion").update({ creado_por: otro.id }).eq("id", sesion);
    expect(error).toBeNull();
    expect(await creadoPor()).toBe(otro.id);
  });
});

describe("20. consentimiento: el cliente solo puede revocarlo", () => {
  let entrenador: Usuario;
  let adminU: Usuario;
  let atleta: string;
  let consentimiento: string;

  beforeAll(async () => {
    atleta = await crearAtleta();
    entrenador = await crearUsuario({ rol: "entrenador" });
    adminU = await crearUsuario({ rol: "admin" });
    await asignar(entrenador.id, atleta, "2020-01-01");
    const { data, error } = await admin().from("consentimiento").select("id").eq("atleta_id", atleta).single();
    if (error) throw new Error(error.message);
    consentimiento = data.id as string;
  });
  afterAll(limpiar);

  const fila = async () =>
    (
      await admin()
        .from("consentimiento")
        .select("otorgado_por_nombre, revocado_en")
        .eq("id", consentimiento)
        .single()
    ).data!;

  it("cambiar otro campo → error, también para el admin con su JWT", async () => {
    for (const u of [entrenador, adminU]) {
      const { error } = await u.cliente
        .from("consentimiento")
        .update({ otorgado_por_nombre: "Falso" })
        .eq("id", consentimiento);
      expect(error?.code).toBe(RLS);
    }
    expect(await fila()).toEqual({ otorgado_por_nombre: "Apoderado Test", revocado_en: null });
  });

  it("revocar y a la vez cambiar otro campo → error", async () => {
    const { error } = await entrenador.cliente
      .from("consentimiento")
      .update({ revocado_en: new Date().toISOString(), version_texto: "v9" })
      .eq("id", consentimiento);
    expect(error?.code).toBe(RLS);
    expect((await fila()).revocado_en).toBeNull();
  });

  it("revocar (null → fecha) → ok", async () => {
    const { error } = await entrenador.cliente
      .from("consentimiento")
      .update({ revocado_en: new Date().toISOString() })
      .eq("id", consentimiento);
    expect(error).toBeNull();
    expect((await fila()).revocado_en).not.toBeNull();
  });

  it("des-revocar o re-revocar → error", async () => {
    const antes = (await fila()).revocado_en;
    for (const revocado_en of [null, "2020-01-01T00:00:00Z"]) {
      const { error } = await entrenador.cliente
        .from("consentimiento")
        .update({ revocado_en })
        .eq("id", consentimiento);
      expect(error?.code).toBe(RLS);
    }
    expect((await fila()).revocado_en).toBe(antes);
  });

  it("el service role sí puede corregirlo", async () => {
    const { error } = await admin().from("consentimiento").update({ revocado_en: null }).eq("id", consentimiento);
    expect(error).toBeNull();
    expect((await fila()).revocado_en).toBeNull();
  });

  const nuevo = (registrado_por: string | null) => ({
    atleta_id: atleta,
    otorgado_por_nombre: "Apoderado Insert",
    relacion: "apoderado",
    medio: "papel",
    version_texto: "v1",
    otorgado_en: "2026-01-01",
    registrado_por,
  });

  it("insertar con registrado_por ajeno o null → error; con el propio → ok", async () => {
    for (const r of [adminU.id, null]) {
      const { error } = await entrenador.cliente.from("consentimiento").insert(nuevo(r));
      expect(error?.code).toBe(RLS);
    }
    expect(await cuenta("consentimiento", { atleta_id: atleta, otorgado_por_nombre: "Apoderado Insert" })).toBe(0);
    const { error } = await entrenador.cliente.from("consentimiento").insert(nuevo(entrenador.id));
    expect(error).toBeNull();
    expect(await cuenta("consentimiento", { atleta_id: atleta, registrado_por: entrenador.id })).toBe(1);
  });
});

describe("21. captura.storage_path queda en la carpeta del usuario", () => {
  let remero: Usuario;
  let otro: Usuario;

  beforeAll(async () => {
    remero = await crearUsuario({ rol: "remero", atletaId: await crearAtleta() });
    otro = await crearUsuario({ rol: "remero", atletaId: await crearAtleta() });
  });
  afterAll(limpiar);

  it.each([
    ["carpeta ajena", () => `${otro.id}/x.jpg`],
    ["sin carpeta", () => "x.jpg"],
    ["con ..", () => `${remero.id}/../${otro.id}/x.jpg`],
  ])("insertar con %s → error", async (_, ruta) => {
    const storage_path = ruta();
    const { error } = await remero.cliente.from("captura").insert({ storage_path, subida_por: remero.id });
    expect(error?.code).toBe(RLS);
    expect(await cuenta("captura", { storage_path })).toBe(0);
  });

  it("en su carpeta → ok; luego storage_path no se puede cambiar", async () => {
    const { data, error } = await remero.cliente
      .from("captura")
      .insert({ storage_path: `${remero.id}/ok.jpg`, subida_por: remero.id })
      .select("id")
      .single();
    expect(error).toBeNull();
    const upd = await remero.cliente
      .from("captura")
      .update({ storage_path: `${remero.id}/otra.jpg` })
      .eq("id", data!.id);
    expect(upd.error?.code).toBe(RLS);
    const { data: c } = await admin().from("captura").select("storage_path").eq("id", data!.id).single();
    expect(c).toEqual({ storage_path: `${remero.id}/ok.jpg` });
    const otros = await remero.cliente.from("captura").update({ modelo: "m" }).eq("id", data!.id);
    expect(otros.error).toBeNull();
  });
});

describe("22. anon y authenticated sin TRUNCATE, REFERENCES ni TRIGGER", () => {
  // En CI (Supabase local) psql existe en el runner: ahí el test nunca se omite.
  it.skipIf(!puedeConsultarCatalogo() && !process.env.CI)("ninguna tabla ni vista de public los concede", async () => {
    const prohibidos = await consultaCatalogo(`
      select c.relname, r.rolname, a.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      join pg_roles r on r.oid = a.grantee
      where n.nspname = 'public'
        and c.relkind in ('r', 'v', 'm', 'p', 'f')
        and r.rolname in ('anon', 'authenticated')
        and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')`);
    expect(prohibidos).toEqual([]);
    // Lo que RLS necesita sigue concedido.
    const sesion = await consultaCatalogo(`
      select p as privilegio, has_table_privilege('authenticated', 'public.sesion', p) as tiene
      from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p`);
    expect(sesion).toEqual(
      ["SELECT", "INSERT", "UPDATE", "DELETE"].map((privilegio) => ({ privilegio, tiene: true })),
    );
  });
});
