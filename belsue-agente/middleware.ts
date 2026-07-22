import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Acceso unificado por rol (sesión NextAuth):
 *  - /        → según rol: admin → /admin, asesor → /chat; sin sesión → /login
 *  - /chat    → cualquier usuario autenticado
 *  - /admin   → solo usuarios con rol 'admin'
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = await getToken({ req: request });

  // --- raíz: deriva según el estado de sesión y el rol ---
  if (pathname === "/") {
    if (!token) return NextResponse.redirect(new URL("/login", request.url));
    const dest = token.role === "admin" ? "/admin" : "/chat";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // --- /admin: requiere sesión y rol admin ---
  if (pathname.startsWith("/admin")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (token.role !== "admin") {
      return NextResponse.redirect(new URL("/chat", request.url));
    }
    return NextResponse.next();
  }

  // --- /chat y /conocimiento: requieren sesión (cualquier rol) ---
  if (pathname.startsWith("/chat") || pathname.startsWith("/conocimiento")) {
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
  matcher: ["/", "/chat/:path*", "/admin/:path*", "/conocimiento/:path*"],
};
