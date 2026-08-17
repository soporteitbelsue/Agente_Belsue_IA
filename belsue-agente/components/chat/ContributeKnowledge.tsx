"use client";

import { useState } from "react";
import AddKnowledgeModal from "@/components/admin/AddKnowledgeModal";
import { DEFAULT_SCOPE, type AgentScope } from "@/lib/scopes";

/**
 * Botón "Aportar conocimiento" de la barra lateral del chat. Abre el mismo
 * formulario que la pantalla de Conocimiento, así que desde aquí se puede
 * añadir tanto una nota como un documento.
 *
 * Disponible para cualquier usuario autenticado: alimentar la base de
 * conocimiento es trabajo de todo el equipo.
 */
export default function ContributeKnowledge({
  scope = DEFAULT_SCOPE,
}: {
  scope?: AgentScope;
} = {}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-belsue/40 bg-white px-3 py-2 text-sm font-medium text-belsue transition hover:bg-belsue/5"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
        Aportar conocimiento
      </button>

      {open && (
        <AddKnowledgeModal scope={scope} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
