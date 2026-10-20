import { z } from "zod";

const esquemaEnvPublico = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export type EnvPublico = z.infer<typeof esquemaEnvPublico>;

/** Valida las variables públicas; el error lista cada variable faltante o inválida. */
export function leerEnvPublico(
  fuente: Record<string, string | undefined>,
): EnvPublico {
  const resultado = esquemaEnvPublico.safeParse(fuente);
  if (resultado.success) return resultado.data;

  const detalle = resultado.error.issues
    .map((i) => {
      const nombre = String(i.path[0]);
      const ausente = fuente[nombre] === undefined || fuente[nombre] === "";
      return `${nombre} (${ausente ? "falta" : "valor inválido"})`;
    })
    .join(", ");
  throw new Error(
    `Variables de entorno públicas faltantes o inválidas: ${detalle}. Revisa .env.local.`,
  );
}

// Las referencias son literales para que Next las incruste en el bundle del cliente.
export const envPublico: EnvPublico = leerEnvPublico({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
