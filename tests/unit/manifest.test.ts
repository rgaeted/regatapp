import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("manifest de la PWA", () => {
  const m = manifest();

  it("declara identidad y modo de visualización", () => {
    expect(m.name).toBe("Regatapp");
    expect(m.short_name).toBe("Regatapp");
    expect(m.lang).toBe("es-CL");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#183243");
    expect(m.theme_color).toBe(m.background_color);
  });

  it("incluye los tres íconos con su propósito", () => {
    const icons = m.icons ?? [];
    const porSrc = Object.fromEntries(icons.map((i) => [i.src, i]));
    expect(icons).toHaveLength(3);
    expect(porSrc["/icons/192"]).toMatchObject({ sizes: "192x192", type: "image/png", purpose: "any" });
    expect(porSrc["/icons/512"]).toMatchObject({ sizes: "512x512", type: "image/png", purpose: "any" });
    expect(porSrc["/icons/512-maskable"]).toMatchObject({ sizes: "512x512", type: "image/png", purpose: "maskable" });
  });
});
