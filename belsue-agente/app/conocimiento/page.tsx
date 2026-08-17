"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import NoteForm, { type EditableNote } from "@/components/admin/NoteForm";
import UploadForm from "@/components/admin/UploadForm";
import DocumentMetaForm, {
  type EditableDocument,
} from "@/components/admin/DocumentMetaForm";
import { CardsSkeleton } from "@/components/Skeleton";
import {
  CATEGORY_BADGE,
  categoryFilterOptions,
  categoryLabel,
  parseScope,
  scopeConfig,
  type AgentScope,
} from "@/lib/scopes";

/** Nota o documento: en esta pantalla se tratan igual. */
interface Item {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  company: string | null;
  category: string | null;
  scopes: AgentScope[];
  file_type: string;
  file_size: number;
  created_at: string;
  author: string | null;
  downloadable: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  nota: "Nota",
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  txt: "Texto",
};

const TYPE_FILTERS = [
  { value: "", label: "Todo" },
  { value: "nota", label: "Solo notas" },
  { value: "documento", label: "Solo documentos" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ventana con fondo oscuro, para los formularios y las confirmaciones. */
function Modal({
  onClose,
  children,
  wide = false,
}: {
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div
        className={`my-8 w-full rounded-lg bg-white p-5 shadow-xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        <div className="mb-2 flex justify-end">
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
        {children}
      </div>
    </div>
  );
}

function ConocimientoContent() {
  const scope = parseScope(useSearchParams().get("scope"));
  const config = scopeConfig(scope);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");

  // Qué se está añadiendo: null (nada), "elegir", "nota" o "documento".
  const [adding, setAdding] = useState<null | "elegir" | "nota" | "documento">(
    null,
  );
  const [editNote, setEditNote] = useState<EditableNote | null>(null);
  const [editDoc, setEditDoc] = useState<EditableDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (category) params.set("category", category);
      if (type) params.set("type", type);
      const res = await fetch(`/api/documents/browse?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar.");
      setItems(data.items as Item[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, [category, type, scope]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("document-uploaded", handler);
    return () => window.removeEventListener("document-uploaded", handler);
  }, [load]);

  useEffect(() => {
    setCategory("");
  }, [scope]);

  async function download(item: Item) {
    setOpeningId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${item.id}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo descargar.");
      window.open(data.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar.");
    } finally {
      setOpeningId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    // Las notas y los documentos se borran por rutas distintas: la de notas
    // deja borrar al autor, la de documentos es solo de administración.
    const url =
      deleteTarget.file_type === "nota"
        ? `/api/documents/note/${deleteTarget.id}`
        : `/api/documents/${deleteTarget.id}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setDeleting(false);
    }
  }

  const term = search.trim().toLowerCase();
  const filtered = term
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(term) ||
          (i.content ?? "").toLowerCase().includes(term) ||
          (i.description ?? "").toLowerCase().includes(term) ||
          (i.company ?? "").toLowerCase().includes(term),
      )
    : items;

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
          <h1 className="text-2xl font-bold text-gray-800">
            {config.knowledge.title}
          </h1>
          <p className="text-sm text-gray-500">
            Todo lo que sabe el agente en este portal: notas escritas por el
            equipo y documentos subidos. Cualquiera puede aportar.
          </p>
        </div>
        <button
          onClick={() => setAdding("elegir")}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white transition hover:bg-belsue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Añadir conocimiento
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título, contenido o compañía…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none"
        >
          {TYPE_FILTERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
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
      {loading && <CardsSkeleton />}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-sm text-gray-500">
            {items.length === 0
              ? "Todavía no hay nada aquí. Añade la primera nota o sube un documento."
              : "No hay resultados para esa búsqueda."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-800">{item.name}</h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    item.file_type === "nota"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {TYPE_LABEL[item.file_type] ?? item.file_type}
                </span>
                {item.category && (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      CATEGORY_BADGE[item.category] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {categoryLabel(scope, item.category)}
                  </span>
                )}
              </div>
            </div>

            {item.content ? (
              <p className="whitespace-pre-wrap text-sm text-gray-600">
                {item.content}
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                {item.description || (
                  <span className="text-gray-400">Sin descripción</span>
                )}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-400">
              {item.company && <span>🏢 {item.company}</span>}
              <span>✍️ {item.author ?? "—"}</span>
              <span>{new Date(item.created_at).toLocaleDateString("es-ES")}</span>
              {item.file_type !== "nota" && (
                <span>{formatBytes(item.file_size)}</span>
              )}

              <span className="ml-auto flex items-center gap-3">
                {item.downloadable && (
                  <button
                    onClick={() => download(item)}
                    disabled={openingId === item.id}
                    className="font-medium text-belsue hover:underline disabled:opacity-50"
                  >
                    {openingId === item.id ? "Abriendo…" : "Descargar"}
                  </button>
                )}
                {item.can_edit && (
                  <button
                    onClick={() =>
                      item.file_type === "nota"
                        ? setEditNote({
                            id: item.id,
                            name: item.name,
                            content: item.content,
                            company: item.company,
                            category: item.category,
                            scopes: item.scopes,
                          })
                        : setEditDoc({
                            id: item.id,
                            name: item.name,
                            description: item.description,
                            company: item.company,
                            category: item.category,
                            scopes: item.scopes,
                          })
                    }
                    className="font-medium text-gray-500 hover:text-belsue hover:underline"
                  >
                    Editar
                  </button>
                )}
                {item.can_delete && (
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="font-medium text-gray-400 hover:text-red-600 hover:underline"
                  >
                    Borrar
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Elegir qué se añade */}
      {adding === "elegir" && (
        <Modal onClose={() => setAdding(null)}>
          <h2 className="text-lg font-semibold text-gray-800">
            ¿Qué quieres añadir?
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Las dos cosas acaban igual: el agente las usa para responder.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setAdding("nota")}
              className="rounded-lg border border-gray-200 p-4 text-left transition hover:border-belsue/40 hover:shadow-sm"
            >
              <span className="block font-semibold text-gray-800">Una nota</span>
              <span className="mt-1 block text-sm text-gray-500">
                Lo escribes tú aquí mismo: una regla, un truco, cómo se hace
                algo. Sin archivos.
              </span>
            </button>
            <button
              onClick={() => setAdding("documento")}
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
        </Modal>
      )}

      {adding === "nota" && (
        <Modal onClose={() => setAdding(null)}>
          <NoteForm
            embedded
            scope={scope}
            onSaved={() => {
              load();
              setTimeout(() => setAdding(null), 1000);
            }}
          />
        </Modal>
      )}

      {adding === "documento" && (
        <Modal onClose={() => setAdding(null)}>
          <UploadForm scope={scope} />
        </Modal>
      )}

      {editNote && (
        <Modal onClose={() => setEditNote(null)}>
          <NoteForm
            embedded
            scope={scope}
            note={editNote}
            onSaved={() => {
              load();
              setTimeout(() => setEditNote(null), 1000);
            }}
          />
        </Modal>
      )}

      {editDoc && (
        <Modal onClose={() => setEditDoc(null)}>
          <DocumentMetaForm
            doc={editDoc}
            onSaved={() => {
              load();
              setTimeout(() => setEditDoc(null), 1000);
            }}
          />
        </Modal>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-800">
              ¿Borrar {deleteTarget.file_type === "nota" ? "la nota" : "el documento"}?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Se borrará <b>{deleteTarget.name}</b> y el agente dejará de
              responder con {deleteTarget.file_type === "nota" ? "ella" : "él"}.
            </p>
            {deleteTarget.file_type !== "nota" && (
              <p className="mt-2 text-sm text-gray-500">
                También se borra el archivo original, y si es material de un
                curso, la lección desaparece del curso.
              </p>
            )}
            <p className="mt-2 text-sm text-gray-500">No se puede deshacer.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Borrando…" : "Borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConocimientoPage() {
  return (
    <Suspense fallback={null}>
      <ConocimientoContent />
    </Suspense>
  );
}
