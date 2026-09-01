import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Acceso unificado por rol (sesión NextAuth):
 *  - /                 → selector de portales; sin sesión → /login
 *  - /chat             → El Formador (cualquier usuario autenticado)
 *  - /procedimientos   → Procedimientos internos (cualquier autenticado)
 *  - /admin            → solo usuarios con rol 'admin'
 *  - /cuenta           → cambio de contraseña (cualquier autenticado)
 *
 * Además, quien tenga una contraseña temporal puesta por administración no
 * puede ir a ningún sitio salvo a cambiarla.
 */
const PASSWORD_PAGE = "/cuenta/contrasena";

/**
 * URL absoluta a la que redirigir, construida desde las cabeceras del proxy.
 *
 * No se usa `request.url`: detrás de un proxy inverso Next devuelve ahí su
 * dirección de escucha (`localhost:3000`) en lugar del dominio público, y las
 * redirecciones sacaban al usuario fuera del sitio. Con el proxy delante, el
 * dominio real llega en `x-forwarded-host` (o en `host`), y el esquema en
 * `x-forwarded-proto`.
 */
function destino(request: NextRequest, pathname: string): URL {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");

  return new URL(pathname, `${proto}://${host}`);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = await getToken({ req: request });

  // --- Contraseña temporal pendiente de cambiar: nada más está permitido ---
  if (token?.mustChangePassword && !pathname.startsWith(PASSWORD_PAGE)) {
    return NextResponse.redirect(destino(request, PASSWORD_PAGE));
  }

  // --- /cuenta: cualquier usuario con sesión ---
  if (pathname.startsWith("/cuenta")) {
    if (!token) {
      const loginUrl = destino(request, "/login");
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // --- raíz: el selector de portales, solo con sesión ---
  if (pathname === "/") {
    if (!token) return NextResponse.redirect(destino(request, "/login"));
    return NextResponse.next();
  }

  // --- /admin: requiere sesión y rol admin ---
  if (pathname.startsWith("/admin")) {
    if (!token) {
      const loginUrl = destino(request, "/login");
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (token.role !== "admin") {
      return NextResponse.redirect(destino(request, "/"));
    }
    return NextResponse.next();
  }

  // --- Resto de páginas del asistente: requieren sesión (cualquier rol) ---
  if (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/procedimientos") ||
    pathname.startsWith("/conocimiento") ||
    pathname.startsWith("/documentos")
  ) {
    if (!token) {
      const loginUrl = destino(request, "/login");
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:path*",
    "/procedimientos/:path*",
    "/admin/:path*",
    "/conocimiento/:path*",
    "/documentos/:path*",
    "/cuenta/:path*",
  ],
};
