import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { retrieveRelevantChunks } from "@/lib/retrieval";
import { supabaseServer } from "@/lib/supabase";
import {
  createConversation,
  getSessionUserId,
  saveMessage,
  userOwnsConversation,
} from "@/lib/conversations";
import { sendNotification, escapeHtml } from "@/lib/email";
import { buildSystemPrompt } from "@/lib/prompts";
import { buildCatalogue } from "@/lib/catalogue";
import { AGENT_SCOPES, DEFAULT_SCOPE, scopeConfig } from "@/lib/scopes";
import type { Source } from "@/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  query: z.string().min(1, "La consulta no puede estar vacía."),
  conversationId: z.string().uuid().optional(),
  /** Pestaña desde la que se pregunta: decide prompt y conocimiento usados. */
  scope: z.enum(AGENT_SCOPES).optional().default(DEFAULT_SCOPE),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
});

/**
 * Detecta si la respuesta es un "no sé responder". El modelo no usa siempre la
 * misma frase exacta, así que reconocemos las formas habituales: "no encuentro
 * / no dispongo de / no tengo esa información", "no aparece/consta/figura en los
 * documentos ni notas", etc. Se usa para avisar por correo del hueco de
 * conocimiento.
 */
const NO_ANSWER_RE =
  /no\s+(?:encuentro|dispongo\s+de|tengo|hay|consta|aparece|figura|puedo\s+(?:encontrar|ofrecer|proporcionar|dar))\b[\s\S]{0,60}?(?:informaci|dato|document|nota|belsu)/i;

/** Longitud a partir de la cual un mensaje se busca por sí solo. */
const SHORT_MESSAGE = 80;

/** Fragmentos que se arrastran de la respuesta anterior. */
const CARRIED_SOURCES = 4;

/**
 * Construye la consulta con la que se buscan los documentos.
 *
 * Los mensajes cortos suelen ser continuaciones que no se sostienen solas
 * ("Rellenarla contigo", "sí, el segundo", "Juan Pérez, 45 años"): buscadas
 * tal cual no se parecen a ningún documento y el agente acaba diciendo que no
 * encuentra algo que sí tiene. En esos casos se les añade lo último que
 * preguntó el usuario, que es lo que les da sentido.
 *
 * Las preguntas largas se buscan tal cual: ahí añadir contexto anterior
 * emborronaría la búsqueda en vez de afinarla.
 */
function buildSearchQuery(
  query: string,
  messages: { role: "user" | "assistant"; content: string }[],
): string {
  if (query.trim().length > SHORT_MESSAGE) return query;

  const previousUser = messages
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => m.content.trim())
    .filter(Boolean);

  return [...previousUser, query].join("\n");
}

/**
 * Formatea los chunks recuperados como bloque de contexto para el prompt.
 * La etiqueta del segundo campo depende del ámbito ("Compañía" en seguros,
 * "Área o responsable" en procedimientos): es la misma columna con otro sentido.
 */
function buildContext(sources: Source[], scope: string): string {
  if (sources.length === 0) return "";
  const secondaryLabel = scopeConfig(scope).secondaryField.label;
  return sources
    .map(
      (s) =>
        `--- Documento: ${s.documentName} | ${secondaryLabel}: ${
          s.company ?? "N/D"
        } | Categoría: ${s.category ?? "N/D"} ---\n${s.content}`,
    )
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    const result = bodySchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? "Petición inválida." },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { query, messages, scope } = parsed;
  const supabase = supabaseServer();

  // 1. Resolver la conversación (existente, propia y del mismo ámbito, o nueva).
  let conversationId: string;
  try {
    if (parsed.conversationId) {
      const owns = await userOwnsConversation(
        supabase,
        parsed.conversationId,
        userId,
        scope,
      );
      if (!owns) {
        return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
      }
      conversationId = parsed.conversationId;
    } else {
      conversationId = await createConversation(supabase, userId, scope);
    }
  } catch (err) {
    console.error("[chat] Error con la conversación:", err);
    return NextResponse.json(
      { error: "No se pudo iniciar la conversación." },
      { status: 500 },
    );
  }

  // 2. Guardar el mensaje del usuario (genera título si es el primero).
  try {
    await saveMessage(supabase, { conversationId, role: "user", content: query });
  } catch (err) {
    console.error("[chat] Error al guardar el mensaje del usuario:", err);
  }

  // 3. Recuperar chunks del ámbito y construir su system prompt.
  let sources: Source[] = [];
  try {
    sources = await retrieveRelevantChunks(
      buildSearchQuery(query, messages),
      8,
      scope,
    );
  } catch (err) {
    console.error("[chat] Error al recuperar chunks:", err);
  }

  // Arrastrar parte de los fragmentos de la respuesta anterior. Sin esto, una
  // tarea de varios turnos (rellenar una plantilla campo a campo) pierde el
  // documento en cuanto el usuario contesta con datos sueltos, que no se
  // parecen a nada. Van detrás de los recién buscados, que mandan.
  if (parsed.conversationId) {
    try {
      const { data: last } = await supabase
        .from("messages")
        .select("sources")
        .eq("conversation_id", conversationId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const previous = (last?.sources ?? []) as Source[];
      const seen = new Set(sources.map((s) => s.content.trim()));
      for (const source of previous) {
        if (sources.length >= 8 + CARRIED_SOURCES) break;
        const key = source.content.trim();
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push(source);
      }
    } catch (err) {
      console.error("[chat] Error al arrastrar fuentes anteriores:", err);
    }
  }

  // El catálogo (solo nombres) permite responder qué material existe; el
  // contexto, qué dice. Son cosas distintas y el prompt las separa.
  let catalogue = "";
  try {
    catalogue = await buildCatalogue(scope);
  } catch (err) {
    console.error("[chat] Error al construir el catálogo:", err);
  }

  const systemPrompt = buildSystemPrompt(
    scope,
    buildContext(sources, scope),
    catalogue,
  );

  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: query },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Al inicio: informar del conversationId (para que el frontend ajuste la URL).
      send({ type: "conversation_id", conversationId });

      let answer = "";
      try {
        const completion = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages: chatMessages,
          // Sin temperature fija: los modelos nuevos de OpenAI solo admiten el
          // valor por defecto. Omitirla mantiene la compatibilidad con
          // cualquier modelo (gpt-4o y posteriores).
          stream: true,
        });

        for await (const part of completion) {
          const delta = part.choices[0]?.delta?.content;
          if (delta) {
            answer += delta;
            send({ type: "text", content: delta });
          }
        }

        send({ type: "sources", sources });
        send({ type: "done" });
      } catch (err) {
        console.error("[chat] Error durante el streaming:", err);
        const message = err instanceof Error ? err.message : "Error desconocido.";
        send({ type: "error", error: message });
      } finally {
        // 4. Guardar la respuesta del asistente (si se generó algo) y enviar su
        //    id al cliente para poder valorarla (feedback).
        if (answer.trim()) {
          try {
            const saved = await saveMessage(supabase, {
              conversationId,
              role: "assistant",
              content: answer,
              sources,
            });
            send({ type: "message_id", messageId: saved.id });
          } catch (saveErr) {
            console.error("[chat] Error al guardar la respuesta:", saveErr);
          }
        }

        // 5. Si el agente no supo responder, avisar por correo con la consulta
        //    (para detectar qué conocimiento falta). Best-effort.
        const noSupo =
          answer.trim().length > 0 &&
          (sources.length === 0 || NO_ANSWER_RE.test(answer));
        if (noSupo) {
          const scopeTitle = scopeConfig(scope).title;
          await sendNotification(
            `⚠️ ${scopeTitle} no supo responder una consulta`,
            `<p>El asistente (pestaña <b>${escapeHtml(
              scopeTitle,
            )}</b>) no encontró respuesta a esta consulta de un asesor:</p>
             <blockquote style="border-left:3px solid #8a0c3c;padding-left:12px;color:#333">${escapeHtml(
               query,
             )}</blockquote>
             <p style="color:#666"><b>Respuesta dada:</b> ${escapeHtml(
               answer.slice(0, 400),
             )}</p>
             <p>Quizá convenga subir un documento o añadir una nota que cubra este tema.</p>`,
          );
        }

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
