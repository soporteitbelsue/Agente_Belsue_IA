"use client";

import { useState } from "react";
import NoteForm from "@/components/admin/NoteForm";
import UploadForm from "@/components/admin/UploadForm";
import { scopeConfig, type AgentScope } from "@/lib/scopes";

/**
 * Aportar conocimiento: primero se elige entre nota o documento y después se
 * rellena lo que toque.
 *
 * Lo usan la pantalla de Conocimiento y el botón de la barra lateral del chat,
 * para que aportar sea lo mismo se entre por donde se entre.
 */
export default function AddKnowledgeModal({
  scope,
  onClose,
  onSaved,
}: {
  scope: AgentScope;
  onClose: () => void;
  /** Se llama al guardar, por si quien lo abre tiene que recargar su lista. */
  onSaved?: () => void;
}) {
  const [choice, setChoice] = useState<null | "nota" | "documento">(null);
  const config = scopeConfig(scope);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          {choice ? (
            <button
              onClick={() => setChoice(null)}
              className="text-sm font-medium text-belsue hover:underline"
            >
              ← Elegir otra cosa
            </button>
          ) : (
            <span className="text-xs text-gray-400">
              Se añadirá a {config.title}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {choice === null && (
          <>
            <h2 className="text-lg font-semibold text-gray-800">
              ¿Qué quieres añadir?
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Las dos cosas acaban igual: el agente las usa para responder.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setChoice("nota")}
                className="rounded-lg border border-gray-200 p-4 text-left transition hover:border-belsue/40 hover:shadow-sm"
              >
                <span className="block font-semibold text-gray-800">
                  Una nota
                </span>
                <span className="mt-1 block text-sm text-gray-500">
                  Lo escribes tú aquí mismo: una regla, un truco, cómo se hace
                  algo. Sin archivos.
                </span>
              </button>
              <button
                onClick={() => setChoice("documento")}
                className="rounded-lg border border-gray-200 p-4 text-left transition hover:border-belsue/40 hover:shadow-sm"
              >
                <span className="block font-semibold text-gray-800">
                  Un documento
                </span>
                <span className="mt-1 block text-sm text-gray-500">
                  Subes un archivo (PDF, Word, PowerPoint o texto) y se indexa
                  entero.
                </span>
              </button>
            </div>
          </>
        )}

        {choice === "nota" && (
          <NoteForm
            embedded
            scope={scope}
            onSaved={() => {
              onSaved?.();
              setTimeout(onClose, 1000);
            }}
          />
        )}

        {/* UploadForm avisa por su cuenta con el evento 'document-uploaded',
            que es lo que escuchan las listas para recargarse. */}
        {choice === "documento" && <UploadForm scope={scope} />}
      </div>
    </div>
  );
}
