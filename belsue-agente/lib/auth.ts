import { NextRequest, NextResponse } from "next/server";

/**
 * Verifica la clave de administración en una API route.
 *
 * Acepta la clave por header `X-Admin-Key` o por la cookie `admin_key`
 * (la que deja el middleware tras visitar /admin?key=...).
 *
 * - Si ADMIN_KEY no está configurada: permite el acceso (modo desarrollo).
 * - Si la clave no coincide: devuelve una respuesta 401.
 * - Si todo está bien: devuelve null (continúa la ejecución).
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const adminKey = process.env.ADMIN_KEY;

  // Sin clave configurada → acceso abierto (desarrollo).
  if (!adminKey) return null;

  const fromHeader = req.headers.get("x-admin-key");
  const fromCookie = req.cookies.get("admin_key")?.value;

  if (fromHeader === adminKey || fromCookie === adminKey) {
    return null;
  }

  return NextResponse.json(
    { error: "No autorizado. Acceso restringido a administración." },
    { status: 401 },
  );
}
