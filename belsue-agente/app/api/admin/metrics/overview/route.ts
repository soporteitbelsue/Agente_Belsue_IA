import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import type { DayMetrics } from "@/types";

export const runtime = "nodejs";

/** GET /api/admin/metrics/overview — resumen de los últimos 30 días. */
export async function GET(_req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Serie diaria (vista conversation_metrics).
    const { data: daysRaw, error: daysError } = await supabase
      .from("conversation_metrics")
      .select("*")
      .gte("day", since)
      .order("day", { ascending: true });

    if (daysError) {
      console.error("[metrics] Error en serie diaria:", daysError);
      return NextResponse.json({ error: daysError.message }, { status: 500 });
    }

    const days: DayMetrics[] = (daysRaw ?? []).map((d) => ({
      day: d.day,
      total_conversations: Number(d.total_conversations ?? 0),
      active_users: Number(d.active_users ?? 0),
      total_messages: Number(d.total_messages ?? 0),
      avg_messages_per_conversation: Number(d.avg_messages_per_conversation ?? 0),
    }));

    // Totales globales.
    const { count: totalConversations } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true });

    const { data: sumRows } = await supabase
      .from("conversations")
      .select("message_count, user_id");

    const totalMessages = (sumRows ?? []).reduce(
      (acc, r) => acc + (r.message_count ?? 0),
      0,
    );
    const totalUsersActive = new Set(
      (sumRows ?? []).map((r) => r.user_id),
    ).size;

    // Valoraciones (feedback) de las respuestas.
    const { count: fbPositive } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("feedback", 1);
    const { count: fbNegative } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("feedback", -1);

    return NextResponse.json({
      days,
      totals: {
        total_conversations: totalConversations ?? 0,
        total_messages: totalMessages,
        total_users_active: totalUsersActive,
        feedback_positive: fbPositive ?? 0,
        feedback_negative: fbNegative ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
