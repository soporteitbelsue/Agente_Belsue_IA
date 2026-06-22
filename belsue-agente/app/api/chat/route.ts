import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { retrieveRelevantChunks } from "@/lib/retrieval";
import type { Source } from "@/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  query: z.string().min(1, "La consulta no puede estar vacía."),
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

const SYSTEM_TEMPLATE = `Eres el asistente interno de Belsué Mediación de Seguros. Tu función es ayudar a los asesores de Belsué a resolver dudas sobre productos, compañías aseguradoras, coberturas, condicionados y procedimientos internos.

Responde siempre en español, con un tono profesional pero cercano. Sé directo y concreto.

Cuando respondas basándote en los documentos internos de Belsué, indica qué documento has consultado.
Cuando no encuentres la información en los documentos internos, puedes usar tu conocimiento general sobre el sector asegurador español, pero indícalo claramente con: 'Según mi conocimiento general (no basado en documentos de Belsué):'

Nunca inventes coberturas, exclusiones ni datos de pólizas específicas. Si no sabes algo con certeza, dilo.

Contexto de documentos internos disponibles:
{context}

Si el contexto está vacío, no hay documentos relevantes para esta consulta.`;

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

  // 1-4. Recuperar chunks y construir el system prompt.
  let sources: Source[] = [];
  try {
    sources = await retrieveRelevantChunks(query, 5);
  } catch (err) {
    console.error("[chat] Error al recuperar chunks:", err);
    // Continuamos sin contexto: el modelo usará su conocimiento general.
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

      try {
        // 6. Llamada a OpenAI con streaming.
        const completion = await openai.chat.completions.create({
          model: CHAT_MODEL,
          messages: chatMessages,
          temperature: 0.2,
          stream: true,
        });

        // 7. Reenviar cada fragmento de texto al cliente.
        for await (const part of completion) {
          const delta = part.choices[0]?.delta?.content;
          if (delta) {
            send({ type: "text", content: delta });
          }
        }

        // 8. Enviar las fuentes usadas y el evento de fin.
        send({ type: "sources", sources });
        send({ type: "done" });
      } catch (err) {
        console.error("[chat] Error durante el streaming:", err);
        const message = err instanceof Error ? err.message : "Error desconocido.";
        send({ type: "error", error: message });
      } finally {
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
