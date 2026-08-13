"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import UploadForm from "@/components/admin/UploadForm";
import DocumentMetaForm, {
  type EditableDocument,
} from "@/components/admin/DocumentMetaForm";
import { TableSkeleton } from "@/components/Skeleton";
import {
  CATEGORY_BADGE,
  categoryFilterOptions,
  categoryLabel,
  parseScope,
  scopeConfig,
  type AgentScope,
} from "@/lib/scopes";

interface Doc {
  id: string;
  name: string;
  description: string | null;
  company: string | null;
  category: string | null;
  scopes: AgentScope[];
  file_type: string;
  file_size: number;
  created_at: string;
  downloadable: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentosContent() {
  // El ámbito viene de la pestaña desde la que se ha llegado.
  const scope = parseScope(useSearchParams().get("scope"));
  const config = scopeConfig(scope);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  // Corregir los datos de un documento es cosa de administración (la API solo
  // se lo permite a admin); aquí el botón se muestra donde se ve el documento.
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [editTarget, setEditTarget] = useState<EditableDocument | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (category) params.set("category", category);
      const res = await fetch(`/api/documents/browse?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar documentos.");
      setDocs(data.documents as Doc[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, [category, scope]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("document-uploaded", handler);
    return () => window.removeEventListener("document-uploaded", handler);
  }, [load]);

  // Al cambiar de pestaña, la categoría filtrada puede no existir en la nueva.
  useEffect(() => {
    setCategory("");
  }, [scope]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={config.path}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
          >
            ← Volver a {config.title}
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">Documentos</h1>
          <p className="text-sm text-gray-500">{config.documentsDescription}</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white transition hover:bg-belsue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5" />
          </svg>
          Subir documento
        </button>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg">
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => setShowUpload(false)}
                aria-label="Cerrar"
                className="rounded-md bg-white/90 p-1 text-gray-500 shadow hover:bg-white hover:text-gray-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <UploadForm scope={scope} />
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => setEditTarget(null)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <DocumentMetaForm
              doc={editTarget}
              onSaved={() => {
                load();
                setTimeout(() => setEditTarget(null), 1000);
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            scope === "procedimientos"
              ? "Buscar por nombre o área…"
              : "Buscar por nombre o compañía…"
          }
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none"
        >
          {categoryFilterOptions(scope).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <TableSkeleton />}

      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-500">
          {docs.length === 0
            ? "Aún no hay documentos subidos en esta pestaña."
            : "No hay resultados para esa búsqueda."}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">
                  {config.secondaryField.label}
                </th>
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
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          CATEGORY_BADGE[d.category] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {categoryLabel(scope, d.category)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {formatBytes(d.file_size)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
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

                      {isAdmin && (
                        <button
                          onClick={() =>
                            setEditTarget({
                              id: d.id,
                              name: d.name,
                              description: d.description,
                              company: d.company,
                              category: d.category,
                              scopes: d.scopes,
                            })
                          }
                          className="text-sm font-medium text-gray-500 hover:text-belsue hover:underline"
                        >
                          Editar
                        </button>
                      )}
                    </div>
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

export default function DocumentosPage() {
  return (
    <Suspense fallback={null}>
      <DocumentosContent />
    </Suspense>
  );
}
