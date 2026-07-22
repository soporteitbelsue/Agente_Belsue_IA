import type { ChatMessage } from "@/types";
import Markdown from "./Markdown";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
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
  onShowSources,
  sourcesActive = false,
  onFeedback,
}: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-belsue bg-belsue px-4 py-2.5 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const sourceCount = message.sources?.length ?? 0;
  const canRate = !!message.id && !!onFeedback && !isStreaming;
  const fb = message.feedback ?? null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-2">
        <div className="rounded-2xl rounded-bl-sm bg-[#F5F5F5] px-4 py-2.5 text-gray-800">
          {isStreaming && message.content === "" ? (
            <span className="flex items-center gap-1 text-sm text-gray-400">
              escribiendo
              <span className="streaming-cursor" aria-hidden />
            </span>
          ) : (
            <>
              <Markdown content={message.content} />
              {isStreaming && <span className="streaming-cursor" aria-hidden />}
            </>
          )}
          {message.incomplete && (
            <p className="mt-1 text-xs italic text-gray-400">
              (respuesta incompleta)
            </p>
          )}
        </div>

        {sourceCount > 0 && (
          <button
            onClick={onShowSources}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
              sourcesActive
                ? "border-belsue bg-belsue/10 text-belsue"
                : "border-gray-300 text-gray-500 hover:border-belsue/40 hover:text-belsue"
            }`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {sourceCount} {sourceCount === 1 ? "fuente" : "fuentes"}
          </button>
        )}

        {canRate && (
          <div className="flex items-center gap-1 pl-1">
            <button
              onClick={() => onFeedback!(message.id!, fb === 1 ? null : 1)}
              aria-label="Respuesta útil"
              title="Útil"
              className={`rounded-md p-1 transition ${
                fb === 1
                  ? "bg-green-100 text-green-600"
                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              }`}
            >
              <svg className="h-4 w-4" fill={fb === 1 ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14 9V5.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
              </svg>
            </button>
            <button
              onClick={() => onFeedback!(message.id!, fb === -1 ? null : -1)}
              aria-label="Respuesta poco útil"
              title="Poco útil"
              className={`rounded-md p-1 transition ${
                fb === -1
                  ? "bg-red-100 text-red-600"
                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              }`}
            >
              <svg className="h-4 w-4" fill={fb === -1 ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
