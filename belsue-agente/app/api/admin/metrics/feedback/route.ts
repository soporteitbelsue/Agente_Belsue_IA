import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

interface MsgRow {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
}

/**
 * GET /api/admin/metrics/feedback — respuestas marcadas como poco útiles (👎),
 * con la pregunta del usuario que las precedió. Ayuda a detectar qué
 * conocimiento falta. Solo admin.
 */
export async function GET(_req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();

    // Respuestas del asistente valoradas negativamente.
    const { data: bad, error } = await supabase
      .from("messages")
      .select("id, conversation_id, content, created_at")
      .eq("feedback", -1)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[metrics] Error al listar feedback negativo:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const badRows = (bad ?? []) as MsgRow[];
    const conversationIds = [...new Set(badRows.map((m) => m.conversation_id))];

    // Preguntas de usuario de esas conversaciones (para emparejar la anterior).
    let questions: MsgRow[] = [];
    if (conversationIds.length > 0) {
      const { data: userMsgs } = await supabase
        .from("messages")
        .select("id, conversation_id, content, created_at")
        .in("conversation_id", conversationIds)
        .eq("role", "user")
        .order("created_at", { ascending: true });
      questions = (userMsgs ?? []) as MsgRow[];
    }

    // Para cada respuesta 👎, la última pregunta anterior en su conversación.
    const items = badRows.map((resp) => {
      const prior = questions
        .filter(
          (q) =>
            q.conversation_id === resp.conversation_id &&
            q.created_at < resp.created_at,
        )
        .pop();
      return {
        id: resp.id,
        question: prior?.content ?? null,
        response: resp.content,
        created_at: resp.created_at,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
