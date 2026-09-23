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

/**
 * Portales cuyo conocimiento (documentos y notas) puede editar y borrar
 * cualquier usuario autenticado, no solo administración. En El Formador lo
 * mantiene todo el equipo; el resto sigue siendo cosa de administración.
 */
export const OPEN_EDIT_SCOPES: readonly string[] = ["seguros"];

/** true si alguno de los portales del elemento está abierto a todo el equipo. */
export function isOpenEditScope(scopes: readonly string[] | null | undefined): boolean {
  return (scopes ?? []).some((s) => OPEN_EDIT_SCOPES.includes(s));
}

/**
 * Permiso para editar o borrar un documento o nota ya cargado: administración
 * siempre; cualquier otro usuario autenticado, si es de un portal abierto.
 *
 * - Sin sesión → 401.
 * - Sin permiso → 403.
 * - Con permiso → null (continúa la ejecución).
 */
export async function requireDocumentManager(
  scopes: readonly string[] | null | undefined,
): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (session.user.role === "admin" || isOpenEditScope(scopes)) return null;
  return NextResponse.json(
    { error: "Acceso restringido a administración." },
    { status: 403 },
  );
}
