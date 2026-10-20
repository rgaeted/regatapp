import { describe, expect, it } from "vitest";
import { admin, crearAtleta, crearSesion, crearUsuario, limpiar } from "./helpers";

describe("limpiar()", () => {
  it("no deja residuo cuando un usuario está vinculado a un atleta y creó sesiones", async () => {
    const atletaId = await crearAtleta();
    const { id: userId } = await crearUsuario({ rol: "remero", atletaId });
    const sesionId = await crearSesion(atletaId, { creado_por: userId });

    await limpiar();

    const db = admin();
    const cuenta = async (tabla: string, col: string, id: string) => {
      const { count, error } = await db.from(tabla).select("*", { count: "exact", head: true }).eq(col, id);
      expect(error).toBeNull();
      return count;
    };
    expect(await cuenta("atleta", "id", atletaId)).toBe(0);
    expect(await cuenta("perfil", "user_id", userId)).toBe(0);
    expect(await cuenta("sesion", "id", sesionId)).toBe(0);
    expect(await cuenta("consentimiento", "atleta_id", atletaId)).toBe(0);
    const { data } = await db.auth.admin.getUserById(userId);
    expect(data.user).toBeNull();
  });
});
