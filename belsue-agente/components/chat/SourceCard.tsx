"use client";

import { useState } from "react";
import type { Source } from "@/types";

function truncate(text: string, max = 150): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}...`;
}

export default function SourceCard({ source }: { source: Source }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleDownload() {
    if (!source.documentId) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${source.documentId}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo descargar.");
      window.open(data.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar.");
    } finally {
      setDownloading(false);
    }
  }

  const Badges = () => (
    <>
      {source.company && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
          {source.company}
        </span>
      )}
      {source.category && (
        <span className="rounded bg-belsue/10 px-1.5 py-0.5 font-medium text-belsue">
          {source.category}
        </span>
      )}
    </>
  );

  const DownloadButton = () =>
    source.documentId ? (
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 font-medium text-gray-600 transition hover:border-belsue/40 hover:text-belsue disabled:opacity-50"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        {downloading ? "Abriendo…" : "Descargar"}
      </button>
    ) : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver fragmento completo"
        className="w-full rounded-md border border-gray-200 bg-white p-3 text-left text-xs shadow-sm transition hover:border-belsue/40 hover:shadow"
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-gray-800">
            {source.documentName}
          </span>
          <Badges />
          <span className="ml-auto whitespace-nowrap text-gray-400">
            {Math.round(source.similarity * 100)}%
          </span>
        </div>
        <p className="text-gray-600">{truncate(source.content)}</p>
        <span className="mt-1 inline-block font-medium text-belsue">
          Ver más →
        </span>
      </button>

      {source.documentId && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          <DownloadButton />
          {error && <span className="text-[11px] text-gray-400">{error}</span>}
        </div>
      )}

      {/* Modal con el fragmento completo */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  {source.documentName}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badges />
                  <span className="text-gray-400">
                    {Math.round(source.similarity * 100)}% relevancia
                  </span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {source.content}
              </p>
            </div>

            {source.documentId && (
              <div className="flex items-center justify-between gap-2 border-t border-gray-200 p-3 text-xs">
                <span className="text-gray-400">
                  Descarga el documento completo:
                </span>
                <DownloadButton />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
