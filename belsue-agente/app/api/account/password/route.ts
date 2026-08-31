import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import { authOptions } from "@/lib/authOptions";
import { describePasswordProblem } from "@/lib/password";

export const runtime = "nodejs";

const bodySchema = z.object({
  currentPassword: z.string().min(1, "Escribe tu contraseña actual."),
  newPassword: z.string().min(1, "Escribe la contraseña nueva."),
});

/**
 * POST /api/account/password — el propio usuario cambia su contraseña.
 *
 * Pide siempre la actual, incluso cuando viene obligado por un reseteo: la
 * temporal se la acaban de dar, y así una sesión abierta en un equipo ajeno
 * no basta para quedarse con la cuenta.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    const { currentPassword, newPassword } = parsed.data;

    const problem = describePasswordProblem(newPassword);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "La contraseña nueva tiene que ser distinta de la actual." },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();
    const { data: user, error: readError } = await supabase
      .from("users")
      .select("id, password_hash, is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (readError || !user || !user.is_active) {
      return NextResponse.json(
        { error: "No se ha podido comprobar la cuenta." },
        { status: 400 },
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "La contraseña actual no es correcta." },
        { status: 400 },
      );
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    const { error: updateError } = await supabase
      .from("users")
      .update({
        password_hash,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[account] Error al cambiar la contraseña:", updateError);
      return NextResponse.json(
        { error: "No se ha podido guardar la contraseña." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
