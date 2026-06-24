import type { Source } from "@/types";
import SourceCard from "./SourceCard";

interface Props {
  sources: Source[] | null;
  onClose?: () => void;
}

export default function SourcesPanel({ sources, onClose }: Props) {
  return (
    <div className="flex h-full flex-col bg-[var(--color-background-secondary)]">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Fuentes consultadas
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 lg:hidden"
            aria-label="Cerrar fuentes"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {sources && sources.length > 0 ? (
          <div className="space-y-2">
            {sources.map((source, i) => (
              <SourceCard key={i} source={source} />
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center px-4 text-center text-gray-400">
            <svg className="mb-2 h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm">
              Las fuentes de la respuesta del agente aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
