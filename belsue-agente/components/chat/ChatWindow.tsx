"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Source } from "@/types";
import MessageBubble from "./MessageBubble";

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

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Índice del mensaje que se está recibiendo por streaming.
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);
  // Última consulta del usuario, para poder reintentar tras un error.
  const lastQueryRef = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-expansión del textarea hasta MAX_TEXTAREA_LINES líneas.
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(el).lineHeight || "20", 10);
    const maxHeight = lineHeight * MAX_TEXTAREA_LINES + 16; // + padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const runQuery = useCallback(async (text: string) => {
    setError(null);
    setIsLoading(true);
    lastQueryRef.current = text;

    // Historial enviado a la API (excluye el mensaje de bienvenida inicial).
    let assistantIndex = -1;
    let history: { role: "user" | "assistant"; content: string }[] = [];

    setMessages((prev) => {
      history = prev
        .slice(1)
        .map((m) => ({ role: m.role, content: m.content }));
      const next: ChatMessage[] = [
        ...prev,
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
        body: JSON.stringify({ query: text, messages: history }),
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
      }) => {
        if (payload.type === "text" && payload.content) {
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
          const dataLine = evt
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            apply(JSON.parse(dataLine.slice("data: ".length)));
          } catch {
            /* fragmento incompleto: ignorar */
          }
        }
      }

      // Si el stream terminó sin un evento 'done', marca incompleto.
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
      // Elimina la burbuja del asistente si no llegó nada de texto.
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
    }
  }, []);

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
    if (lastQueryRef.current) {
      void runQuery(lastQueryRef.current);
    }
  };

  const showSuggestions = messages.length === 1 && !isLoading;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4">
      {/* Zona de mensajes */}
      <div className="flex-1 space-y-5 overflow-y-auto py-6">
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            message={m}
            isStreaming={streamingIndex === i}
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

      {/* Input */}
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
  );
}
