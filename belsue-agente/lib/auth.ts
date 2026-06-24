import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * Verifica que la petición la hace un usuario con rol 'admin' (sesión NextAuth).
 *
 * - Sin sesión → 401.
 * - Con sesión pero sin rol admin → 403.
 * - Admin → devuelve null (continúa la ejecución).
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Acceso restringido a administración." },
      { status: 403 },
    );
  }
  return null;
}
