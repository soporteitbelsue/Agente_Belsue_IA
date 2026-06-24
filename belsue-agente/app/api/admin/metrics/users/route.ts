import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import type { UserMetrics } from "@/types";

export const runtime = "nodejs";

/** GET /api/admin/metrics/users — uso por asesor (vista user_metrics). */
export async function GET(_req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.from("user_metrics").select("*");

    if (error) {
      console.error("[metrics] Error en user_metrics:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users: UserMetrics[] = (data ?? [])
      .map((u) => ({
        user_id: u.user_id,
        user_name: u.user_name,
        department: u.department ?? null,
        total_conversations: Number(u.total_conversations ?? 0),
        total_messages: Number(u.total_messages ?? 0),
        last_active: u.last_active ?? null,
      }))
      .sort((a, b) => b.total_conversations - a.total_conversations);

    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
