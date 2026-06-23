import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protecciones:
 *  - /admin  → clave ADMIN_KEY (header X-Admin-Key, cookie admin_key, o
 *              ?key=... que guarda la cookie). Sin auth de usuario.
 *  - /chat   → sesión válida de NextAuth (login de asesor).
 *  - /       → redirige a /chat.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- /admin: protección por ADMIN_KEY ---
  if (pathname.startsWith("/admin")) {
    const adminKey = process.env.ADMIN_KEY;

    // Sin ADMIN_KEY configurada → acceso abierto (modo desarrollo).
    if (!adminKey) return NextResponse.next();

    const keyFromQuery = request.nextUrl.searchParams.get("key");
    const keyFromHeader = request.headers.get("x-admin-key");
    const keyFromCookie = request.cookies.get("admin_key")?.value;

    // Acceso por query param: valida, guarda cookie y limpia la URL.
    if (keyFromQuery) {
      if (keyFromQuery === adminKey) {
        const url = request.nextUrl.clone();
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
      return NextResponse.redirect(new URL("/chat", request.url));
    }

    if (keyFromHeader === adminKey || keyFromCookie === adminKey) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/chat", request.url));
  }

  // --- /chat: requiere sesión NextAuth ---
  if (pathname.startsWith("/chat")) {
    const token = await getToken({ req: request });
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // --- raíz ---
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/chat/:path*", "/admin/:path*"],
};
