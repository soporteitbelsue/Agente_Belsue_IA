import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import {
  getSessionUserId,
  saveMessage,
  userOwnsConversation,
} from "@/lib/conversations";

export const runtime = "nodejs";

const bodySchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  sources: z.array(z.any()).optional(),
});

/** POST /api/conversations/{id}/messages — guarda un mensaje. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const owns = await userOwnsConversation(supabase, params.id, userId);
    if (!owns) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const message = await saveMessage(supabase, {
      conversationId: params.id,
      role: parsed.data.role,
      content: parsed.data.content,
      sources: parsed.data.sources,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
