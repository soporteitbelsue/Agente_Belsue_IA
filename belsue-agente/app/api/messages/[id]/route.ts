import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId, userOwnsConversation } from "@/lib/conversations";

export const runtime = "nodejs";

const bodySchema = z.object({
  // 1 = útil, -1 = poco útil, null = quitar la valoración.
  value: z.union([z.literal(1), z.literal(-1), z.null()]),
});

/**
 * PATCH /api/messages/{id} — guarda la valoración (feedback) de una respuesta.
 * Solo el dueño de la conversación puede valorar sus mensajes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let value: 1 | -1 | null;
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Valor de feedback no válido." },
        { status: 400 },
      );
    }
    value = parsed.data.value;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Localiza el mensaje y comprueba que la conversación es del usuario.
  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .select("id, conversation_id, role")
    .eq("id", params.id)
    .maybeSingle();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }
  if (!msg) {
    return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  }
  if (msg.role !== "assistant") {
    return NextResponse.json(
      { error: "Solo se pueden valorar las respuestas del asistente." },
      { status: 400 },
    );
  }

  const owns = await userOwnsConversation(supabase, msg.conversation_id, userId);
  if (!owns) {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  const { error } = await supabase
    .from("messages")
    .update({ feedback: value })
    .eq("id", params.id);

  if (error) {
    console.error("[messages] Error al guardar feedback:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, feedback: value });
}
