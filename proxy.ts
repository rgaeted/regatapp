import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { envPublico } from "@/lib/env";

// Next 16: "proxy" reemplaza a "middleware". Refresca la sesión de Supabase.
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    envPublico.NEXT_PUBLIC_SUPABASE_URL,
    envPublico.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesAEscribir, headers) {
          cookiesAEscribir.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          respuesta = NextResponse.next({ request });
          cookiesAEscribir.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([k, v]) =>
            respuesta.headers.set(k, v),
          );
        },
      },
    },
  );

  // No ejecutar lógica entre createServerClient y getUser().
  await supabase.auth.getUser();

  return respuesta;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|apple-icon|manifest.webmanifest|favicon.ico).*)",
  ],
};
