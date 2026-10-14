"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import AddKnowledgeModal from "@/components/admin/AddKnowledgeModal";
import { DEFAULT_SCOPE, type AgentScope } from "@/lib/scopes";

const TILE =
  "flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-card bg-ios-surface text-xs font-medium text-ios-label shadow-ios transition-colors duration-150 hover:bg-ios-surface-hover";

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
  className = TILE,
}: {
  scope?: AgentScope;
  /** Forma del botón: tesela de la barra desplegada o de la plegada. */
  className?: string;
} = {}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Aportar conocimiento"
        className={className}
      >
        <svg
          className="h-[22px] w-[22px] text-ios-label"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
        Aportar
      </button>

      {/* El modal se monta en <body>: la barra lateral lleva backdrop-filter,
          y eso encierra cualquier "position: fixed" de dentro, así que sin
          portal el pop-up quedaba encajado en la barra en vez de cubrir la
          pantalla. Fuera de .ios conserva también su aspecto de siempre. */}
      {open &&
        createPortal(
          <AddKnowledgeModal scope={scope} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  );
}
