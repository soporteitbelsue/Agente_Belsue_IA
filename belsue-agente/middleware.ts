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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = await getToken({ req: request });

  // --- Contraseña temporal pendiente de cambiar: nada más está permitido ---
  if (token?.mustChangePassword && !pathname.startsWith(PASSWORD_PAGE)) {
    return NextResponse.redirect(new URL(PASSWORD_PAGE, request.url));
  }

  // --- /cuenta: cualquier usuario con sesión ---
  if (pathname.startsWith("/cuenta")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // --- raíz: el selector de portales, solo con sesión ---
  if (pathname === "/") {
    if (!token) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  // --- /admin: requiere sesión y rol admin ---
  if (pathname.startsWith("/admin")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (token.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
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
      const loginUrl = new URL("/login", request.url);
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
