import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";

export const runtime = "nodejs";

const updateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    /** Nueva posición dentro del curso (para reordenar las lecciones). */
    position: z.number().int().min(0).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "No hay cambios que guardar.",
  });

/** PATCH /api/lessons/{id} — renombra o reordena una lección. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: z.infer<typeof updateSchema>;
  try {
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const fields: Record<string, unknown> = {};
  if (body.title !== undefined) fields.title = body.title;
  if (body.description !== undefined) {
    fields.description = body.description || null;
  }
  if (body.position !== undefined) fields.position = body.position;

  const { data, error } = await supabase
    .from("lessons")
    .update(fields)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Lección no encontrada." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/lessons/{id} — saca la lección del curso. El documento sigue
 * existiendo (y consultable por el agente); solo deja de formar parte del curso.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { error } = await supabase.from("lessons").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
