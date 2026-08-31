import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { generateTempPassword } from "@/lib/password";

export const runtime = "nodejs";

const USER_FIELDS =
  "id, name, email, role, department, is_active, created_at, last_login, must_change_password, password_changed_at";

/**
 * POST /api/admin/users/{id}/reset-password
 *
 * Pone una contraseña temporal al usuario y lo marca para que la cambie en
 * cuanto entre. Devuelve la contraseña en claro UNA sola vez: no se guarda
 * en ningún sitio, así que si el administrador cierra el aviso sin copiarla
 * hay que repetir el reseteo.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const password = generateTempPassword();
    const password_hash = await bcrypt.hash(password, 12);

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("users")
      .update({
        password_hash,
        must_change_password: true,
        password_changed_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select(USER_FIELDS)
      .maybeSingle();

    if (error) {
      console.error("[users] Error al restablecer la contraseña:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Usuario no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ password, user: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
