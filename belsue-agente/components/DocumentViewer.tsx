"use client";

import { useEffect } from "react";

/**
 * Visor a pantalla completa. Sirve para un archivo (PDF o texto, que el
 * navegador sabe pintar por su cuenta) y para el texto de una nota.
 *
 * Lo usan las lecciones de los cursos y el listado de conocimiento: leer un
 * documento no debería obligar a descargarlo y abrirlo aparte.
 */
export default function DocumentViewer({
  title,
  subtitle,
  url,
  text,
  onClose,
  extra,
}: {
  title: string;
  subtitle?: string;
  /** Archivo a mostrar en el marco. */
  url?: string;
  /** Texto plano, para las notas, que no tienen archivo. */
  text?: string;
  onClose: () => void;
  /** Controles propios de quien lo abre (por ejemplo, anterior y siguiente). */
  extra?: React.ReactNode;
}) {
  // Escape cierra, que es lo que espera cualquiera a pantalla completa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-sm font-medium">{title}</span>
          {subtitle && (
            <span className="hidden shrink-0 text-xs text-white/50 sm:inline">
              {subtitle}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {extra}
          <button
            onClick={onClose}
            title="Cerrar (Esc)"
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
          >
            Cerrar
          </button>
        </div>
      </div>

      {url ? (
        <iframe
          src={url}
          title={title}
          className="w-full flex-1 border-0 bg-white"
        />
      ) : (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="mx-auto max-w-3xl px-6 py-10">
            <h1 className="mb-4 text-2xl font-bold text-gray-800">{title}</h1>
            <p className="whitespace-pre-wrap leading-relaxed text-gray-700">
              {text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
