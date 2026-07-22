import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { processAndStoreText } from "@/lib/embeddings";

export const runtime = "nodejs";

const NOTE_FIELDS = "id, name, content, company, category, created_at, file_type";

/**
 * GET /api/documents/note/{id} — devuelve una nota concreta (para editarla).
 * Solo admin.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("documents")
    .select(NOTE_FIELDS)
    .eq("id", params.id)
    .eq("file_type", "nota")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Nota no encontrada." }, { status: 404 });
  }
  return NextResponse.json({ note: data });
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    content: z.string().trim().min(10).optional(),
    company: z.string().trim().nullable().optional(),
    category: z.string().trim().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "No hay cambios que guardar.",
  });

/**
 * PATCH /api/documents/note/{id} — actualiza una nota. Si cambia el texto,
 * se vuelve a indexar (regenera los embeddings). Solo admin.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: z.infer<typeof updateSchema>;
  try {
    const json = await req.json();
    const parsed = updateSchema.safeParse(json);
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

  // Actualiza los campos de la nota.
  const updateFields: Record<string, unknown> = {};
  if (body.name !== undefined) updateFields.name = body.name;
  if (body.content !== undefined) {
    updateFields.content = body.content;
    updateFields.file_size = Buffer.byteLength(body.content, "utf8");
  }
  if (body.company !== undefined) updateFields.company = body.company || null;
  if (body.category !== undefined) updateFields.category = body.category;

  const { data, error } = await supabase
    .from("documents")
    .update(updateFields)
    .eq("id", params.id)
    .eq("file_type", "nota")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[note] Error al actualizar la nota:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Nota no encontrada." }, { status: 404 });
  }

  // Si cambió el texto, re-indexar (regenera embeddings).
  if (body.content !== undefined) {
    try {
      await processAndStoreText(params.id, body.content);
    } catch (procErr) {
      console.error(`[note] Error al re-indexar la nota ${params.id}:`, procErr);
      const message =
        procErr instanceof Error ? procErr.message : "Error al re-indexar.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
