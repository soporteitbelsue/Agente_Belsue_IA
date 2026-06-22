import type { ChatMessage } from "@/types";
import Markdown from "./Markdown";
import SourceCard from "./SourceCard";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
}

export default function MessageBubble({ message, isStreaming = false }: Props) {
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

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-3">
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

        {message.sources && message.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Fuentes consultadas
            </p>
            {message.sources.map((source, i) => (
              <SourceCard key={i} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
