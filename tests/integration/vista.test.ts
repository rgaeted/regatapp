import { afterAll, describe, expect, it } from "vitest";
import { split500, watts } from "@/lib/tiempo";
import { admin, crearAtleta, crearSesion, limpiar } from "./helpers";

describe("v_sesion_calculada", () => {
  afterAll(limpiar);

  it.each([
    [4200, 2000],
    [900, 500],
    [6203, 1500],
    [42355, 10000],
  ])("coincide con lib/tiempo para tiempo_ds=%i distancia_m=%i", async (t, d) => {
    const atletaId = await crearAtleta();
    const id = await crearSesion(atletaId, { tiempo_ds: t, distancia_m: d });
    const { data, error } = await admin()
      .from("v_sesion_calculada")
      .select("split_500_seg, watts")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect(Math.round(Number(data!.split_500_seg) * 10)).toBe(split500(t, d));
    expect(Number(data!.watts)).toBe(watts(t, d));
  });

  it("devuelve null en split y watts si falta la distancia", async () => {
    const atletaId = await crearAtleta();
    const id = await crearSesion(atletaId, { distancia_m: null, tiempo_ds: 4200 });
    const { data, error } = await admin()
      .from("v_sesion_calculada")
      .select("split_500_seg, watts")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect(data!.split_500_seg).toBeNull();
    expect(data!.watts).toBeNull();
  });
});
