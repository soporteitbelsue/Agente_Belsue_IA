import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const USER_FIELDS =
  "id, name, email, role, department, is_active, created_at, last_login";

const createSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio."),
  email: z.string().email("Email no válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  role: z.enum(["asesor", "admin"]).optional().default("asesor"),
  department: z.string().optional(),
});

/** GET /api/admin/users — lista de usuarios (sin password_hash). */
export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("users")
      .select(USER_FIELDS)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[users] Error al listar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/users — crea un usuario. */
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const json = await req.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }

    const { name, email, password, role, department } = parsed.data;
    const password_hash = await bcrypt.hash(password, 12);

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("users")
      .insert({
        name,
        email: email.toLowerCase().trim(),
        password_hash,
        role,
        department: department ?? null,
      })
      .select(USER_FIELDS)
      .single();

    if (error) {
      console.error("[users] Error al crear:", error);
      // 23505 = violación de unique (email duplicado)
      const status = error.code === "23505" ? 409 : 500;
      const message =
        error.code === "23505"
          ? "Ya existe un usuario con ese email."
          : error.message;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ user: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
