"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Document } from "@/types";

type DocumentListItem = Pick<
  Document,
  | "id"
  | "name"
  | "description"
  | "category"
  | "company"
  | "file_type"
  | "file_size"
  | "created_at"
> & { chunk_count: number };

const CATEGORY_OPTIONS = [
  { value: "", label: "Todas las categorías" },
  { value: "general", label: "General" },
  { value: "auto", label: "Auto" },
  { value: "moto", label: "Moto" },
  { value: "hogar", label: "Hogar" },
  { value: "vida", label: "Vida" },
  { value: "salud", label: "Salud" },
  { value: "decesos", label: "Decesos" },
  { value: "viaje", label: "Asistencia en viaje" },
  { value: "rc", label: "Responsabilidad Civil" },
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

// Etiqueta legible para mostrar en el badge (las que difieren del valor).
const CATEGORY_LABEL: Record<string, string> = {
  viaje: "Viaje",
  rc: "RC",
};

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-400">—</span>;
  const cls = CATEGORY_BADGE[category] ?? "bg-gray-100 text-gray-600";
  const label = CATEGORY_LABEL[category] ?? category;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

function ChunkBadge({ count }: { count: number }) {
  if (count > 0) return <span className="text-gray-600">{count}</span>;
  return (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Procesando...
    </span>
  );
}

export default function DocumentList() {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DocumentListItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  // Debounce de 300ms para el filtro de compañía.
  useEffect(() => {
    const t = setTimeout(() => setCompanyFilter(companyInput.trim()), 300);
    return () => clearTimeout(t);
  }, [companyInput]);

  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (companyFilter) params.set("company", companyFilter);
        const qs = params.toString();
        const res = await fetch(`/api/documents${qs ? `?${qs}` : ""}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al cargar documentos.");
        setDocuments(data.documents as DocumentListItem[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido.");
      } finally {
        setLoading(false);
      }
    },
    [category, companyFilter],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  // Carga inicial + cuando cambian los filtros.
  useEffect(() => {
    load(true);
  }, [load]);

  // Auto-refresco cada 10s (sin spinner) para ver el progreso.
  useEffect(() => {
    const interval = setInterval(() => loadRef.current(false), 10000);
    return () => clearInterval(interval);
  }, []);

  // Refresco al subir un documento nuevo.
  useEffect(() => {
    const handler = () => loadRef.current(false);
    window.addEventListener("document-uploaded", handler);
    return () => window.removeEventListener("document-uploaded", handler);
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar.");
      setDeleteTarget(null);
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          Documentos subidos
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-belsue focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={companyInput}
            onChange={(e) => setCompanyInput(e.target.value)}
            placeholder="Filtrar por compañía…"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-belsue focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando…</p>}

      {/* Estado vacío */}
      {!loading && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg
            className="mb-3 h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <p className="text-sm text-gray-500">
            No hay documentos todavía. Sube el primero usando el formulario.
          </p>
        </div>
      )}

      {/* Tabla (desktop) */}
      {documents.length > 0 && (
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Compañía</th>
                <th className="py-2 pr-4 font-medium">Categoría</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Tamaño</th>
                <th className="py-2 pr-4 font-medium">Fragmentos</th>
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-700">
                    {doc.name}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {doc.company ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <CategoryBadge category={doc.category} />
                  </td>
                  <td className="py-2 pr-4 uppercase text-gray-500">
                    {doc.file_type}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {formatBytes(doc.file_size)}
                  </td>
                  <td className="py-2 pr-4">
                    <ChunkBadge count={doc.chunk_count} />
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {new Date(doc.created_at).toLocaleDateString("es-ES")}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => setDeleteTarget(doc)}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards (móvil) */}
      {documents.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg border border-gray-200 p-3 text-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="font-medium text-gray-800">{doc.name}</span>
                <CategoryBadge category={doc.category} />
              </div>
              <dl className="space-y-1 text-gray-500">
                <div className="flex justify-between">
                  <dt>Compañía</dt>
                  <dd>{doc.company ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Tipo</dt>
                  <dd className="uppercase">{doc.file_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Tamaño</dt>
                  <dd>{formatBytes(doc.file_size)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Fragmentos</dt>
                  <dd>
                    <ChunkBadge count={doc.chunk_count} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Fecha</dt>
                  <dd>
                    {new Date(doc.created_at).toLocaleDateString("es-ES")}
                  </dd>
                </div>
              </dl>
              <button
                onClick={() => setDeleteTarget(doc)}
                className="mt-3 w-full rounded-md border border-red-200 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmación de borrado */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-gray-800">
              Eliminar documento
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              ¿Eliminar este documento? Se eliminarán también todos sus
              fragmentos del agente.
            </p>
            <p className="mb-4 truncate rounded bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
              {deleteTarget.name}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
