"use client";

import { useState } from "react";
import NoteForm from "@/components/admin/NoteForm";

/**
 * Botón "Aportar conocimiento" para el chat: abre un modal con el formulario
 * de nota. Disponible para cualquier usuario autenticado (asesor o admin), para
 * que todo el equipo pueda alimentar la base de conocimiento.
 */
export default function ContributeKnowledge() {
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="text-xs text-gray-500">
                Lo que aportes aquí lo usará el agente para responder a todo el
                equipo. Sé concreto (compañía, ramo, condición).
              </p>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <NoteForm embedded />

            <div className="mt-4 text-right">
              <button
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
