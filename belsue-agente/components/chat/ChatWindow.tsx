"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Message, Source } from "@/types";
import MessageBubble from "./MessageBubble";
import SourcesPanel from "./SourcesPanel";

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content: `¡Hola! Soy el asistente interno de Belsué. Puedo ayudarte con dudas sobre:
- Coberturas y condicionados de compañías aseguradoras
- Comparativas entre productos
- Procedimientos internos
- Cualquier duda sobre los ramos que gestionamos

¿En qué puedo ayudarte hoy?`,
};

const SUGGESTIONS = [
  "¿Qué cubre el seguro de hogar de Mapfre?",
  "Diferencias entre cobertura de terceros y todo riesgo",
  "¿Cómo tramitar un siniestro de auto?",
];

const MAX_TEXTAREA_LINES = 4;

interface Props {
  conversationId?: string;
  onConversationCreated?: (id: string) => void;
}

export default function ChatWindow({
  conversationId,
  onConversationCreated,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);
  const lastQueryRef = useRef<string | null>(null);
  // Mensaje cuyas fuentes están "fijadas" en el panel (null = seguir la última).
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [sourcesDrawerOpen, setSourcesDrawerOpen] = useState(false);
  // Id de la conversación activa en este panel (puede crearse al enviar).
  const currentIdRef = useRef<string | null>(conversationId ?? null);

  // Cargar la conversación cuando cambia el id de la URL.
  useEffect(() => {
    // Ya estamos en esta conversación (p. ej. recién creada): no recargar.
    if ((conversationId ?? null) === currentIdRef.current) return;
    currentIdRef.current = conversationId ?? null;

    if (!conversationId) {
      setMessages([WELCOME_MESSAGE]);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const msgs: ChatMessage[] = (data.conversation.messages ?? []).map(
            (m: Message) => ({
              role: m.role,
              content: m.content,
              sources: m.sources,
              id: m.id,
              feedback: m.feedback ?? null,
            }),
          );
          setMessages(msgs.length ? msgs : [WELCOME_MESSAGE]);
        }
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(el).lineHeight || "20", 10);
    const maxHeight = lineHeight * MAX_TEXTAREA_LINES + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const runQuery = useCallback(
    async (text: string) => {
      setError(null);
      setIsLoading(true);
      setPinnedIndex(null); // el panel vuelve a seguir la última respuesta
      lastQueryRef.current = text;

      let assistantIndex = -1;
      let history: { role: "user" | "assistant"; content: string }[] = [];

      setMessages((prev) => {
        // El historial excluye el mensaje de bienvenida sintético.
        history = prev
          .filter((m) => m !== WELCOME_MESSAGE)
          .map((m) => ({ role: m.role, content: m.content }));
        const next: ChatMessage[] = [
          ...prev.filter((m) => m !== WELCOME_MESSAGE),
          { role: "user", content: text },
          { role: "assistant", content: "" },
        ];
        assistantIndex = next.length - 1;
        return next;
      });

      setStreamingIndex(assistantIndex);

      let receivedDone = false;
      let receivedText = false;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: text,
            messages: history,
            conversationId: currentIdRef.current ?? undefined,
          }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo obtener respuesta.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const apply = (payload: {
          type: string;
          content?: string;
          sources?: Source[];
          error?: string;
          conversationId?: string;
          messageId?: string;
        }) => {
          if (payload.type === "conversation_id" && payload.conversationId) {
            // Conversación nueva: fijar id y avisar al contenedor (URL).
            if (!currentIdRef.current) {
              currentIdRef.current = payload.conversationId;
              onConversationCreated?.(payload.conversationId);
            }
          } else if (payload.type === "text" && payload.content) {
            receivedText = true;
            setMessages((prev) => {
              const next = [...prev];
              const cur = next[assistantIndex];
              if (cur) {
                next[assistantIndex] = {
                  ...cur,
                  content: cur.content + payload.content,
                };
              }
              return next;
            });
          } else if (payload.type === "sources") {
            setMessages((prev) => {
              const next = [...prev];
              const cur = next[assistantIndex];
              if (cur) next[assistantIndex] = { ...cur, sources: payload.sources };
              return next;
            });
          } else if (payload.type === "message_id" && payload.messageId) {
            setMessages((prev) => {
              const next = [...prev];
              const cur = next[assistantIndex];
              if (cur) next[assistantIndex] = { ...cur, id: payload.messageId };
              return next;
            });
          } else if (payload.type === "done") {
            receivedDone = true;
          } else if (payload.type === "error") {
            throw new Error(payload.error ?? "Error en el stream.");
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              apply(JSON.parse(dataLine.slice("data: ".length)));
            } catch {
              /* fragmento incompleto */
            }
          }
        }

        if (!receivedDone) {
          setMessages((prev) => {
            const next = [...prev];
            const cur = next[assistantIndex];
            if (cur && cur.role === "assistant") {
              next[assistantIndex] = { ...cur, incomplete: true };
            }
            return next;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido.");
        if (!receivedText) {
          setMessages((prev) => prev.filter((_, i) => i !== assistantIndex));
        } else {
          setMessages((prev) => {
            const next = [...prev];
            const cur = next[assistantIndex];
            if (cur && cur.role === "assistant") {
              next[assistantIndex] = { ...cur, incomplete: true };
            }
            return next;
          });
        }
      } finally {
        setIsLoading(false);
        setStreamingIndex(null);
        // Refrescar el sidebar (título/contador/nueva conversación).
        window.dispatchEvent(new CustomEvent("conversations-changed"));
      }
    },
    [onConversationCreated],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;
      setInput("");
      void runQuery(trimmed);
    },
    [isLoading, runQuery],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleRetry = () => {
    if (lastQueryRef.current) void runQuery(lastQueryRef.current);
  };

  // Guarda (o quita) la valoración de una respuesta. Actualización optimista.
  const submitFeedback = useCallback((id: string, value: 1 | -1 | null) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, feedback: value } : m)),
    );
    fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    }).catch(() => {
      /* si falla, se recupera al recargar la conversación */
    });
  }, []);

  const showSuggestions =
    messages.length === 1 && messages[0] === WELCOME_MESSAGE && !isLoading;

  // Índice del último mensaje del asistente que tiene fuentes.
  const latestSourceIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i]?.sources?.length ?? 0) > 0) return i;
    }
    return null;
  }, [messages]);

  // Mensaje cuyas fuentes se muestran: el fijado o, si no, el último con fuentes.
  const activeSourceIndex = pinnedIndex ?? latestSourceIndex;
  const displayedSources =
    activeSourceIndex !== null
      ? (messages[activeSourceIndex]?.sources ?? null)
      : null;

  return (
    <div className="flex h-full min-h-0">
      {/* Columna del chat */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4">
          <div className="flex-1 space-y-5 overflow-y-auto py-6">
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                isStreaming={streamingIndex === i}
                sourcesActive={activeSourceIndex === i}
                onShowSources={() => {
                  setPinnedIndex(i);
                  setSourcesDrawerOpen(true);
                }}
                onFeedback={submitFeedback}
              />
            ))}

            {showSuggestions && (
              <div className="flex flex-wrap gap-2 pt-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-full border border-belsue/30 bg-belsue/5 px-3 py-1.5 text-sm text-belsue transition hover:bg-belsue/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                <span>{error}</span>
                <button
                  onClick={handleRetry}
                  className="shrink-0 rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  Reintentar
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="sticky bottom-0 flex items-end gap-2 border-t border-gray-200 bg-white py-3"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Escribe tu consulta… (Enter para enviar, Shift+Enter para nueva línea)"
              className="max-h-40 flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm leading-5 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-11 shrink-0 items-center rounded-xl bg-belsue px-5 text-sm font-medium text-white transition hover:bg-belsue-700 disabled:opacity-40"
            >
              {isLoading ? "…" : "Enviar"}
            </button>
          </form>
        </div>
      </div>

      {/* Panel de fuentes (margen derecho, desktop) */}
      <aside className="hidden w-80 shrink-0 border-l border-gray-200 lg:block">
        <SourcesPanel sources={displayedSources} />
      </aside>

      {/* Panel de fuentes como drawer (móvil/tablet) */}
      {sourcesDrawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSourcesDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-[85%] max-w-[340px] border-l border-gray-200 shadow-xl">
            <SourcesPanel
              sources={displayedSources}
              onClose={() => setSourcesDrawerOpen(false)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
