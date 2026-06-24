import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const USER_FIELDS =
  "id, name, email, role, department, is_active, created_at, last_login";

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.enum(["asesor", "admin"]).optional(),
    department: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "No hay campos que actualizar.",
  });

/** PATCH /api/admin/users/{id} — actualiza name, role, department, is_active. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const json = await req.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("users")
      .update(parsed.data)
      .eq("id", params.id)
      .select(USER_FIELDS)
      .maybeSingle();

    if (error) {
      console.error("[users] Error al actualizar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Usuario no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ user: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/users/{id} — desactiva el usuario (is_active = false). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("users")
      .update({ is_active: false })
      .eq("id", params.id)
      .select(USER_FIELDS)
      .maybeSingle();

    if (error) {
      console.error("[users] Error al desactivar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Usuario no encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, user: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
