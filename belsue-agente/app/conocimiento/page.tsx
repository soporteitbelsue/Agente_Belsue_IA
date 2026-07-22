"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ContributeKnowledge from "@/components/chat/ContributeKnowledge";

interface Note {
  id: string;
  name: string;
  content: string | null;
  company: string | null;
  category: string | null;
  created_at: string;
  author: string | null;
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

export default function ConocimientoPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      const qs = params.toString();
      const res = await fetch(`/api/documents/note${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar el conocimiento.");
      setNotes(data.notes as Note[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("document-uploaded", handler);
    return () => window.removeEventListener("document-uploaded", handler);
  }, [load]);

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
            href="/chat"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
          >
            ← Volver al chat
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">
            Conocimiento del equipo
          </h1>
          <p className="text-sm text-gray-500">
            Reglas y recomendaciones que aporta todo el equipo. El agente las usa
            para responder. Cualquiera puede añadir.
          </p>
        </div>
        <div className="shrink-0 sm:w-56">
          <ContributeKnowledge />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en el conocimiento…"
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-sm text-gray-500">
            {notes.length === 0
              ? "Aún no hay conocimiento aportado. ¡Sé el primero!"
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
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize ${
                    CATEGORY_BADGE[n.category] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {n.category}
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-600">
              {n.content}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-400">
              {n.company && <span>🏢 {n.company}</span>}
              <span>✍️ {n.author ?? "—"}</span>
              <span>{new Date(n.created_at).toLocaleDateString("es-ES")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
