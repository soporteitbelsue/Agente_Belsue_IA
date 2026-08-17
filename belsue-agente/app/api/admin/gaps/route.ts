import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { parseScope } from "@/lib/scopes";

export const runtime = "nodejs";

interface Row {
  id: string;
  scope: string;
  question: string;
  answer: string | null;
  resolved: boolean;
  created_at: string;
  users: { name: string } | null;
}

/**
 * GET /api/admin/gaps — consultas que el agente no supo responder.
 *
 * Query param `resolved`: 'true' para ver las ya cubiertas. Por defecto solo
 * las pendientes, que son las que piden acción.
 */
export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const resolved = new URL(req.url).searchParams.get("resolved") === "true";

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("knowledge_gaps")
      .select("id, scope, question, answer, resolved, created_at, users(name)")
      .eq("resolved", resolved)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[gaps] Error al listar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const gaps = ((data ?? []) as unknown as Row[]).map((g) => ({
      id: g.id,
      scope: parseScope(g.scope),
      question: g.question,
      answer: g.answer,
      resolved: g.resolved,
      created_at: g.created_at,
      author: g.users?.name ?? null,
    }));

    return NextResponse.json({ gaps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
