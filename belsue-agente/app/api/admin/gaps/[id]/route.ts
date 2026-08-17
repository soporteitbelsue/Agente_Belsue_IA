import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const updateSchema = z.object({ resolved: z.boolean() });

/**
 * PATCH /api/admin/gaps/{id} — marca un hueco como cubierto (o lo devuelve a
 * pendientes). No se borra: repetirse es la señal de que hace falta material.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: z.infer<typeof updateSchema>;
  try {
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("knowledge_gaps")
    .update({ resolved: body.resolved })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/gaps/{id} — descarta una consulta que no aporta nada. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("knowledge_gaps")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
