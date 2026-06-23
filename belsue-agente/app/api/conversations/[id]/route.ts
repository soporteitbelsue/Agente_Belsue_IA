import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId, userOwnsConversation } from "@/lib/conversations";
import type { Message } from "@/types";

export const runtime = "nodejs";

/** GET /api/conversations/{id} — conversación completa con sus mensajes. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();

    const owns = await userOwnsConversation(supabase, params.id, userId);
    if (!owns) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", params.id)
      .single();
    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversación no encontrada." },
        { status: 404 },
      );
    }

    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", params.id)
      .order("created_at", { ascending: true });
    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    // sources ya viene parseado (jsonb). Normalizamos a Source[] | undefined.
    const parsed: Message[] = (messages ?? []).map((m) => ({
      ...m,
      sources: m.sources ?? undefined,
    }));

    return NextResponse.json({ conversation: { ...conversation, messages: parsed } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/conversations/{id} — borra la conversación (mensajes en cascada). */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();
    const owns = await userOwnsConversation(supabase, params.id, userId);
    if (!owns) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
