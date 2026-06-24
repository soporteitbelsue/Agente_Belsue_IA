import type { ChatMessage } from "@/types";
import Markdown from "./Markdown";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  /** Se llama al pulsar el chip de fuentes (muestra el panel derecho). */
  onShowSources?: () => void;
  /** true si las fuentes de este mensaje son las activas en el panel. */
  sourcesActive?: boolean;
}

export default function MessageBubble({
  message,
  isStreaming = false,
  onShowSources,
  sourcesActive = false,
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
      </div>
    </div>
  );
}
