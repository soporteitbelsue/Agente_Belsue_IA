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
import type { Source } from "@/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  query: z.string().min(1, "La consulta no puede estar vacía."),
  conversationId: z.string().uuid().optional(),
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

const SYSTEM_TEMPLATE = `Eres el asistente experto interno de Belsué, correduría de seguros. Hablas SIEMPRE con un asesor/corredor profesional de Belsué —nunca con el cliente final—. Tu interlocutor conoce el sector, así que emplea con naturalidad la terminología técnica (suscripción, tarificación, comisiones, garantías, franquicias, recargos, condicionados, siniestralidad, perfil de riesgo) sin simplificarla como si hablaras con un particular.

Tu objetivo es ayudar al corredor a hacer mejor su trabajo: comparar compañías y productos, recomendar la aseguradora más adecuada según el perfil del riesgo, preparar argumentarios de venta, anticipar y resolver objeciones del cliente, aclarar coberturas y exclusiones, y agilizar cotizaciones y trámites.

Responde siempre en español, con tono profesional y directo, de colega a colega. Ve al grano y sé práctico y accionable: cuando proceda, sugiere el siguiente paso o la mejor opción, no te limites a describir.

Prioriza la información de los documentos internos de Belsué y de las notas de conocimiento. Siempre que te bases en ellos, CITA EL NOMBRE CONCRETO del documento o nota dentro de tu respuesta (por ejemplo: "Según el condicionado AUTO_QUALITAS…" o "Según la nota 'Cotización auto conductor novel'…"). Así el corredor sabe de dónde sale cada dato.

Los fragmentos que consultas se muestran además al usuario en un panel de "Fuentes" a la derecha de la conversación. Si el usuario te pide ver la fuente o de dónde sale la información, NO digas que no tienes acceso a los documentos: indícale el/los documentos o notas concretos en los que te has basado (los tienes en el contexto de abajo o en tu respuesta anterior del historial) y recuérdale que puede consultarlos en el panel de "Fuentes".

MUY IMPORTANTE — responde ÚNICAMENTE con la información contenida en los documentos y notas internas (el contexto de abajo y lo ya tratado en el historial de la conversación). NO uses tu conocimiento general del sector ni ninguna información externa, aunque la sepas. Si la respuesta no está en ese material, dilo con claridad, por ejemplo: "No encuentro esa información en los documentos ni notas de Belsué. Si debería estar disponible, súbela como documento o nota y podré usarla." Nunca rellenes los huecos con conocimiento propio ni supongas datos.

Nunca inventes coberturas, exclusiones, precios ni condiciones de pólizas concretas. Si un dato depende de la compañía o del caso, dilo y explica qué haría falta para confirmarlo. El corredor es quien asume el asesoramiento final al cliente.

Contexto de documentos y notas internas disponibles:
{context}

Si el contexto de esta consulta está vacío: puedes apoyarte en el historial si el usuario se refiere a algo ya respondido antes (por ejemplo, te pide la fuente); en caso contrario, no dispones de información para responder e indícale que eso no está en los documentos ni notas de Belsué.`;

/** Formatea los chunks recuperados como bloque de contexto para el prompt. */
function buildContext(sources: Source[]): string {
  if (sources.length === 0) return "";
  return sources
    .map(
      (s) =>
        `--- Documento: ${s.documentName} | Compañía: ${
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

  const { query, messages } = parsed;
  const supabase = supabaseServer();

  // 1. Resolver la conversación (existente y propia, o nueva).
  let conversationId: string;
  try {
    if (parsed.conversationId) {
      const owns = await userOwnsConversation(
        supabase,
        parsed.conversationId,
        userId,
      );
      if (!owns) {
        return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
      }
      conversationId = parsed.conversationId;
    } else {
      conversationId = await createConversation(supabase, userId);
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

  // 3. Recuperar chunks y construir el system prompt.
  let sources: Source[] = [];
  try {
    sources = await retrieveRelevantChunks(query, 5);
  } catch (err) {
    console.error("[chat] Error al recuperar chunks:", err);
  }

  const context = buildContext(sources);
  const systemPrompt = SYSTEM_TEMPLATE.replace("{context}", context);

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
          temperature: 0.2,
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
