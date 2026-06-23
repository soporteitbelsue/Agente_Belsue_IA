import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import type { Source } from "@/types";

/** Devuelve el id del usuario autenticado, o null si no hay sesión. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

/**
 * Comprueba que una conversación pertenece al usuario.
 * Devuelve true/false; lanza solo si hay error de BD inesperado.
 */
export async function userOwnsConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data) && data!.user_id === userId;
}

/** Crea una conversación vacía para el usuario y devuelve su id. */
export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear la conversación.");
  }
  return data.id as string;
}

interface SaveMessageParams {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

/**
 * Guarda un mensaje, actualiza message_count y last_message_at de la
 * conversación, y genera el título a partir del primer mensaje del usuario.
 */
export async function saveMessage(
  supabase: SupabaseClient,
  { conversationId, role, content, sources }: SaveMessageParams,
) {
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      sources: role === "assistant" ? (sources ?? null) : null,
    })
    .select("*")
    .single();

  if (error || !message) {
    throw new Error(error?.message ?? "No se pudo guardar el mensaje.");
  }

  // Lee el estado actual de la conversación para actualizar contador y título.
  const { data: conv } = await supabase
    .from("conversations")
    .select("message_count, title")
    .eq("id", conversationId)
    .maybeSingle();

  const update: Record<string, unknown> = {
    message_count: (conv?.message_count ?? 0) + 1,
    last_message_at: new Date().toISOString(),
  };

  // Título automático a partir del primer mensaje del usuario.
  if (role === "user" && !conv?.title) {
    update.title = content.trim().slice(0, 60);
  }

  await supabase.from("conversations").update(update).eq("id", conversationId);

  return message;
}
