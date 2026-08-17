"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import { SCOPES, type AgentScope } from "@/lib/scopes";

interface Gap {
  id: string;
  scope: AgentScope;
  question: string;
  answer: string | null;
  resolved: boolean;
  created_at: string;
  author: string | null;
}

/**
 * Agrupa consultas casi iguales para que se vea lo que se repite, que es lo
 * que de verdad merece que alguien suba material. La comparación es tosca a
 * propósito (minúsculas, sin signos): basta para juntar "cómo tarifico un
 * novel" con "Cómo tarifico un novel?".
 */
function normalize(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function HuecosPage() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gaps?resolved=${showResolved}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar.");
      setGaps(data.gaps as Gap[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  async function setResolved(gap: Gap, resolved: boolean) {
    setGaps((prev) => prev.filter((g) => g.id !== gap.id));
    await fetch(`/api/admin/gaps/${gap.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    }).catch(() => load());
  }

  async function discard(gap: Gap) {
    setGaps((prev) => prev.filter((g) => g.id !== gap.id));
    await fetch(`/api/admin/gaps/${gap.id}`, { method: "DELETE" }).catch(() =>
      load(),
    );
  }

  // Las repetidas van juntas y primero: son las que más urge cubrir.
  const groups = new Map<string, Gap[]>();
  for (const gap of gaps) {
    const key = normalize(gap.question);
    groups.set(key, [...(groups.get(key) ?? []), gap]);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto px-4 py-6">
      <div>
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a los portales
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Huecos de conocimiento
        </h1>
        <p className="text-sm text-gray-500">
          Consultas que el agente no supo responder. Es la mejor guía de qué
          falta por subir: lo que se repite, primero.
        </p>
      </div>

      <AdminTabs active="/admin/huecos" />

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
          className="h-4 w-4 accent-belsue"
        />
        Ver las ya cubiertas
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando…</p>}

      {!loading && ordered.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
          {showResolved
            ? "Todavía no has marcado ninguna como cubierta."
            : "No hay consultas sin responder. El agente está respondiendo a todo."}
        </div>
      )}

      <div className="space-y-3">
        {ordered.map((group) => {
          const gap = group[0]!;
          return (
            <div
              key={gap.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-gray-800">“{gap.question}”</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {group.length > 1 && (
                    <span className="rounded-full bg-belsue px-2 py-0.5 text-xs font-semibold text-white">
                      {group.length} veces
                    </span>
                  )}
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {SCOPES[gap.scope].title}
                  </span>
                </div>
              </div>

              {gap.answer && (
                <p className="mt-2 line-clamp-2 text-sm text-gray-500">
                  Respondió: {gap.answer}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-xs text-gray-400">
                <span>✍️ {gap.author ?? "—"}</span>
                <span>
                  {new Date(gap.created_at).toLocaleDateString("es-ES")}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => setResolved(gap, !showResolved)}
                    className="font-medium text-belsue hover:underline"
                  >
                    {showResolved
                      ? "Volver a pendientes"
                      : "Marcar como cubierta"}
                  </button>
                  <button
                    onClick={() => discard(gap)}
                    className="font-medium text-gray-400 hover:text-red-600 hover:underline"
                  >
                    Descartar
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
