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

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-gray-800">{source.documentName}</span>
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
        <span className="ml-auto whitespace-nowrap text-gray-400">
          {Math.round(source.similarity * 100)}% relevancia
        </span>
      </div>
      <p className="text-gray-600">{truncate(source.content)}</p>

      {source.documentId && (
        <div className="mt-2 flex items-center gap-2">
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
          {error && <span className="text-[11px] text-gray-400">{error}</span>}
        </div>
      )}
    </div>
  );
}
