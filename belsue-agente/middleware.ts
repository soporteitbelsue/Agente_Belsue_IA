import { NextRequest, NextResponse } from "next/server";

/**
 * Protección básica TEMPORAL de /admin (sin auth real todavía).
 *
 * Acepta la clave por dos vías:
 *  1. Header `X-Admin-Key` (útil para clientes API / herramientas).
 *  2. Cookie `admin_key` (necesaria para la navegación normal del navegador,
 *     que NO puede enviar headers personalizados).
 *
 * Para activar el acceso desde el navegador, visita una vez:
 *   /admin?key=TU_ADMIN_KEY
 * y se guardará la cookie automáticamente.
 *
 * Si la clave no coincide, redirige a /chat.
 */
export function middleware(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;

  // Si no hay ADMIN_KEY configurada, no bloqueamos (modo desarrollo abierto).
  if (!adminKey) {
    return NextResponse.next();
  }

  const { searchParams } = req.nextUrl;
  const keyFromQuery = searchParams.get("key");
  const keyFromHeader = req.headers.get("x-admin-key");
  const keyFromCookie = req.cookies.get("admin_key")?.value;

  // Acceso por query param: valida y guarda la cookie, luego limpia la URL.
  if (keyFromQuery) {
    if (keyFromQuery === adminKey) {
      const url = req.nextUrl.clone();
      url.searchParams.delete("key");
      const res = NextResponse.redirect(url);
      res.cookies.set("admin_key", adminKey, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 días
      });
      return res;
    }
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  if (keyFromHeader === adminKey || keyFromCookie === adminKey) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/chat", req.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
