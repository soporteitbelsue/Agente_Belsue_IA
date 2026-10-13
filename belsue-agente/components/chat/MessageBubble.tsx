import { useState } from "react";
import { useSession } from "next-auth/react";
import type { ChatMessage } from "@/types";
import { parseQuickReplies } from "@/lib/quickReplies";
import { downloadAsPdf, guessTitle } from "@/lib/fichaPdf";
import Markdown from "./Markdown";
import ThinkingDots from "./ThinkingDots";

/** Botón de acción bajo la respuesta: sin fondo, icono gris, 44 px de área. */
const ACTION =
  "flex h-11 w-11 items-center justify-center rounded-full text-ios-secondary transition-colors duration-150 hover:bg-ios-fill hover:text-ios-label disabled:opacity-40";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  /** Muestra los botones que ofrezca el mensaje (solo en el último). */
  showOptions?: boolean;
  /** Envía la opción elegida como siguiente mensaje. */
  onOption?: (option: string) => void;
  /** Se llama al pulsar el chip de fuentes (muestra el panel derecho). */
  onShowSources?: () => void;
  /** true si las fuentes de este mensaje son las activas en el panel. */
  sourcesActive?: boolean;
  /** Guarda (o quita) la valoración de la respuesta. */
  onFeedback?: (id: string, value: 1 | -1 | null) => void;
}

export default function MessageBubble({
  message,
  isStreaming = false,
  showOptions = false,
  onOption,
  onShowSources,
  sourcesActive = false,
  onFeedback,
}: Props) {
  // Los hooks van antes del retorno de los mensajes del usuario: deben
  // ejecutarse siempre y en el mismo orden.
  const { data: session } = useSession();
  const [downloading, setDownloading] = useState(false);

  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-[20px_20px_6px_20px] [overflow-wrap:anywhere] bg-ios-accent px-3.5 py-2.5 text-white">
          {message.content}
        </div>
      </div>
    );
  }

  // Contamos DOCUMENTOS, no fragmentos: una respuesta puede apoyarse en varios
  // trozos del mismo documento, y decir "8 fuentes" cuando la fuente es una
  // sola confunde.
  const sources = message.sources ?? [];
  const documentCount = new Set(
    sources.map((s) => s.documentId ?? s.documentName),
  ).size;
  const canRate = !!message.id && !!onFeedback && !isStreaming;
  const fb = message.feedback ?? null;

  // El marcador de los botones se quita SIEMPRE del texto, también en los
  // mensajes antiguos, para que no asome en pantalla.
  const { text, options } = parseQuickReplies(message.content);
  const quickReplies = showOptions && !isStreaming ? options : [];

  const canDownload = !isStreaming && text.trim().length > 0;

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadAsPdf({
        content: text,
        title: guessTitle(text),
        author: session?.user?.name ?? undefined,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[82%] flex-col items-start">
        <div className="max-w-full rounded-[20px_20px_20px_6px] [overflow-wrap:anywhere] bg-ios-surface px-3.5 py-2.5 text-ios-label shadow-ios">
          {isStreaming && message.content === "" ? (
            <ThinkingDots />
          ) : (
            <>
              <Markdown content={text} />
              {isStreaming && <span className="streaming-cursor" aria-hidden />}
            </>
          )}
          {message.incomplete && (
            <p className="mt-1 text-[13px] italic text-ios-secondary">
              (respuesta incompleta)
            </p>
          )}
        </div>

        {/* Elección ofrecida por el agente: un clic responde por ti. */}
        {quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2.5">
            {quickReplies.map((option, i) => (
              <button
                key={option}
                type="button"
                onClick={() => onOption?.(option)}
                style={{ animationDelay: `${i * 0.05}s` }}
                className="animate-msg min-h-[36px] rounded-full border border-ios-border bg-ios-surface px-4 py-1.5 text-[15px] text-ios-label shadow-ios transition-colors duration-150 hover:bg-ios-surface-hover"
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {/* Acciones: fuentes, PDF y valoración. Botones sin fondo con iconos de
            trazo en gris y área táctil de 44 px. */}
        {(documentCount > 0 || canDownload || canRate) && (
          <div className="-ml-2.5 mt-0.5 flex flex-wrap items-center">
            {documentCount > 0 && (
              <button
                type="button"
                onClick={onShowSources}
                aria-pressed={sourcesActive}
                className="group/src flex h-11 items-center px-1"
              >
                <span
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 ${
                    sourcesActive
                      ? "bg-ios-fill-hover text-ios-label"
                      : "bg-ios-fill text-ios-secondary group-hover/src:bg-ios-fill-hover"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {documentCount} {documentCount === 1 ? "fuente" : "fuentes"}
                </span>
              </button>
            )}

            {/* Descarga en PDF: pensado para la ficha rellena, que se sube al
                programa de tarificación, pero sirve para cualquier respuesta. */}
            {canDownload && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                aria-label={downloading ? "Generando PDF" : "Descargar esta respuesta en PDF"}
                title="Descargar esta respuesta en PDF"
                className={ACTION}
              >
                <svg className={`h-5 w-5 ${downloading ? "animate-pulse" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
            )}

            {canRate && (
              <>
                <button
                  type="button"
                  onClick={() => onFeedback!(message.id!, fb === 1 ? null : 1)}
                  aria-label="Respuesta útil"
                  aria-pressed={fb === 1}
                  title="Útil"
                  className={`${ACTION} ${fb === 1 ? "!text-ios-label" : ""}`}
                >
                  <svg className="h-5 w-5" fill={fb === 1 ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14 9V5.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback!(message.id!, fb === -1 ? null : -1)}
                  aria-label="Respuesta poco útil"
                  aria-pressed={fb === -1}
                  title="Poco útil"
                  className={`${ACTION} ${fb === -1 ? "!text-ios-label" : ""}`}
                >
                  <svg className="h-5 w-5" fill={fb === -1 ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
