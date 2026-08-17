"use client";

import { useEffect, useState } from "react";
import { SCOPES, type AgentScope } from "@/lib/scopes";

interface Item {
  id: string;
  name: string;
  file_type: string;
  scopes: AgentScope[];
  created_at: string;
  chunks: number;
}

interface Revision {
  sinIndexar: Item[];
  duplicados: { name: string; items: Item[] }[];
  sinAutor: Item[];
  total: number;
}

function Group({
  title,
  explanation,
  count,
  tone,
  children,
}: {
  title: string;
  explanation: string;
  count: number;
  tone: "red" | "amber" | "gray";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const colors = {
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  }[tone];

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
        <span>✓</span>
        <span>{title}: nada que revisar.</span>
      </div>
    );
  }

  return (
    <div className={`rounded-md border ${colors}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
      >
        <span>
          <b>{count}</b> {title}
          <span className="ml-2 font-normal opacity-80">{explanation}</span>
        </span>
        <span className="shrink-0 text-xs underline">
          {open ? "Ocultar" : "Ver"}
        </span>
      </button>
      {open && <div className="border-t border-current/10 px-3 py-2">{children}</div>}
    </div>
  );
}

function Row({ item }: { item: Item }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-sm">
      <span className="font-medium text-gray-800">{item.name}</span>
      <span className="text-xs uppercase text-gray-400">{item.file_type}</span>
      {item.scopes.map((s) => (
        <span key={s} className="rounded bg-white/70 px-1.5 text-xs text-gray-600">
          {SCOPES[s].title}
        </span>
      ))}
      <span className="text-xs text-gray-400">
        {new Date(item.created_at).toLocaleDateString("es-ES")}
      </span>
    </li>
  );
}

/**
 * Repaso del estado del conocimiento: lo que estropea las respuestas sin que
 * salte ningún aviso. Va plegado y en verde cuando no hay nada, para que no
 * moleste el día que está todo bien.
 */
export default function KnowledgeReview() {
  const [data, setData] = useState<Revision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/revision");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error al revisar.");
        setData(json as Revision);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido.");
      }
    })();
  }, []);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-800">Revisión</h2>

      <Group
        title="sin indexar"
        explanation="se subieron, pero el agente no los ve."
        count={data.sinIndexar.length}
        tone="red"
      >
        <ul>
          {data.sinIndexar.map((i) => (
            <Row key={i.id} item={i} />
          ))}
        </ul>
      </Group>

      <Group
        title="nombres repetidos"
        explanation="puede ser el mismo material subido dos veces."
        count={data.duplicados.length}
        tone="amber"
      >
        <ul>
          {data.duplicados.map((group) => (
            <li key={group.name} className="py-1">
              <span className="text-sm font-medium text-gray-800">
                {group.name}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {group.items.length} copias
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group
        title="sin autor"
        explanation="no consta quién los aportó."
        count={data.sinAutor.length}
        tone="gray"
      >
        <ul>
          {data.sinAutor.map((i) => (
            <Row key={i.id} item={i} />
          ))}
        </ul>
      </Group>
    </div>
  );
}
