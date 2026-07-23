"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Doc {
  id: string;
  name: string;
  description: string | null;
  company: string | null;
  category: string | null;
  file_type: string;
  file_size: number;
  created_at: string;
  downloadable: boolean;
}

const CATEGORY_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "general", label: "General" },
  { value: "auto", label: "Auto" },
  { value: "moto", label: "Moto" },
  { value: "hogar", label: "Hogar" },
  { value: "vida", label: "Vida" },
  { value: "salud", label: "Salud" },
  { value: "decesos", label: "Decesos" },
  { value: "viaje", label: "Viaje" },
  { value: "rc", label: "RC" },
];

const CATEGORY_BADGE: Record<string, string> = {
  auto: "bg-blue-100 text-blue-700",
  moto: "bg-orange-100 text-orange-700",
  hogar: "bg-green-100 text-green-700",
  vida: "bg-purple-100 text-purple-700",
  salud: "bg-pink-100 text-pink-700",
  decesos: "bg-gray-200 text-gray-700",
  viaje: "bg-teal-100 text-teal-700",
  rc: "bg-indigo-100 text-indigo-700",
  general: "bg-belsue/10 text-belsue",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = category ? `?category=${category}` : "";
      const res = await fetch(`/api/documents/browse${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar documentos.");
      setDocs(data.documents as Doc[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  async function download(doc: Doc) {
    setDownloadingId(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo descargar.");
      window.open(data.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar.");
    } finally {
      setDownloadingId(null);
    }
  }

  const term = search.trim().toLowerCase();
  const filtered = term
    ? docs.filter(
        (d) =>
          d.name.toLowerCase().includes(term) ||
          (d.company ?? "").toLowerCase().includes(term),
      )
    : docs;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto px-4 py-6">
      <div>
        <Link
          href="/chat"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver al chat
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Documentos</h1>
        <p className="text-sm text-gray-500">
          Consulta y descarga los documentos y condicionados subidos por el
          equipo.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o compañía…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando…</p>}

      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-500">
          {docs.length === 0
            ? "Aún no hay documentos subidos."
            : "No hay resultados para esa búsqueda."}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Compañía</th>
                <th className="px-4 py-2 font-medium">Categoría</th>
                <th className="px-4 py-2 font-medium">Tamaño</th>
                <th className="px-4 py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-700">
                    {d.name}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{d.company ?? "—"}</td>
                  <td className="px-4 py-2">
                    {d.category ? (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                          CATEGORY_BADGE[d.category] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {d.category}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {formatBytes(d.file_size)}
                  </td>
                  <td className="px-4 py-2">
                    {d.downloadable ? (
                      <button
                        onClick={() => download(d)}
                        disabled={downloadingId === d.id}
                        className="inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        {downloadingId === d.id ? "Abriendo…" : "Descargar"}
                      </button>
                    ) : (
                      <span
                        className="text-xs text-gray-400"
                        title="Documento antiguo: solo está indexado, sin archivo original"
                      >
                        No disponible
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
