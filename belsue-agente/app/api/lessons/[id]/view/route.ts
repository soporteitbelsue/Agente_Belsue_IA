import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";

export const runtime = "nodejs";

/**
 * POST /api/lessons/{id}/view — marca la lección como vista por el usuario.
 * Idempotente: volver a marcarla no falla ni duplica.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("lesson_views")
    .upsert(
      { user_id: userId, lesson_id: params.id },
      { onConflict: "user_id,lesson_id" },
    );

  if (error) {
    console.error("[lesson-view] Error al marcar como vista:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

/** DELETE /api/lessons/{id}/view — desmarca la lección. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("lesson_views")
    .delete()
    .eq("user_id", userId)
    .eq("lesson_id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
