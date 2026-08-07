import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { createConversation, getSessionUserId } from "@/lib/conversations";
import { parseScope } from "@/lib/scopes";

export const runtime = "nodejs";

/**
 * GET /api/conversations — lista las conversaciones del usuario.
 * Query param `scope`: cada pestaña muestra solo su propio historial.
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const scope = parseScope(new URL(req.url).searchParams.get("scope"));

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, message_count, last_message_at, created_at, scope")
      .eq("user_id", userId)
      .eq("scope", scope)
      .order("last_message_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[conversations] Error al listar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ conversations: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/conversations — crea una conversación vacía en el ámbito dado. */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const scope = parseScope(new URL(req.url).searchParams.get("scope"));

  try {
    const supabase = supabaseServer();
    const id = await createConversation(supabase, userId, scope);
    const { data } = await supabase
      .from("conversations")
      .select("id, title, message_count, last_message_at, created_at, scope")
      .eq("id", id)
      .single();
    return NextResponse.json({ conversation: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
