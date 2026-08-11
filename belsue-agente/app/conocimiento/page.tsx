"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ContributeKnowledge from "@/components/chat/ContributeKnowledge";
import NoteForm, { type EditableNote } from "@/components/admin/NoteForm";
import { CardsSkeleton } from "@/components/Skeleton";
import {
  CATEGORY_BADGE,
  categoryFilterOptions,
  categoryLabel,
  parseScope,
  scopeConfig,
  type AgentScope,
} from "@/lib/scopes";

interface Note {
  id: string;
  name: string;
  content: string | null;
  company: string | null;
  category: string | null;
  scopes: AgentScope[];
  created_at: string;
  author: string | null;
}

function ConocimientoContent() {
  // El ámbito viene de la pestaña desde la que se ha llegado.
  const scope = parseScope(useSearchParams().get("scope"));
  const config = scopeConfig(scope);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<EditableNote | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (category) params.set("category", category);
      const res = await fetch(`/api/documents/note?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar el conocimiento.");
      setNotes(data.notes as Note[]);
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

  const term = search.trim().toLowerCase();
  const filtered = term
    ? notes.filter(
        (n) =>
          n.name.toLowerCase().includes(term) ||
          (n.content ?? "").toLowerCase().includes(term) ||
          (n.company ?? "").toLowerCase().includes(term),
      )
    : notes;

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
          <p className="text-sm text-gray-500">{config.knowledge.description}</p>
        </div>
        <div className="shrink-0 sm:w-56">
          <ContributeKnowledge scope={scope} />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            scope === "procedimientos"
              ? "Buscar en los procedimientos…"
              : "Buscar en el conocimiento…"
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
      {loading && <CardsSkeleton />}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-sm text-gray-500">
            {notes.length === 0
              ? scope === "procedimientos"
                ? "Aún no hay procedimientos recogidos. ¡Sé el primero en explicar cómo trabajamos!"
                : "Aún no hay conocimiento aportado. ¡Sé el primero!"
              : "No hay resultados para esa búsqueda."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((n) => (
          <div
            key={n.id}
            className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-800">{n.name}</h3>
              {n.category && (
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                    CATEGORY_BADGE[n.category] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {categoryLabel(scope, n.category)}
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-600">
              {n.content}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-400">
              {n.company && (
                <span>
                  {scope === "procedimientos" ? "🏷️" : "🏢"} {n.company}
                </span>
              )}
              <span>✍️ {n.author ?? "—"}</span>
              <span>{new Date(n.created_at).toLocaleDateString("es-ES")}</span>
              <button
                onClick={() =>
                  setEditTarget({
                    id: n.id,
                    name: n.name,
                    content: n.content,
                    company: n.company,
                    category: n.category,
                    scopes: n.scopes,
                  })
                }
                className="ml-auto font-medium text-belsue hover:underline"
              >
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de edición de nota (cualquier usuario) */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex justify-end">
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
            <NoteForm
              embedded
              scope={scope}
              note={editTarget}
              onSaved={() => {
                load();
                setTimeout(() => setEditTarget(null), 1000);
              }}
            />
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
