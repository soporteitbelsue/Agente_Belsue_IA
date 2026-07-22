"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow, isToday, isThisWeek, isThisMonth } from "date-fns";
import { es } from "date-fns/locale";
import ContributeKnowledge from "@/components/chat/ContributeKnowledge";
import type { Conversation } from "@/types";

type ConvItem = Pick<
  Conversation,
  "id" | "title" | "message_count" | "last_message_at" | "created_at"
>;

interface Group {
  label: string;
  items: ConvItem[];
}

function groupByDate(items: ConvItem[]): Group[] {
  const groups: Record<string, ConvItem[]> = {
    Hoy: [],
    "Esta semana": [],
    "Este mes": [],
    Anteriores: [],
  };
  for (const c of items) {
    const d = new Date(c.last_message_at);
    if (isToday(d)) groups["Hoy"]!.push(c);
    else if (isThisWeek(d, { weekStartsOn: 1 })) groups["Esta semana"]!.push(c);
    else if (isThisMonth(d)) groups["Este mes"]!.push(c);
    else groups["Anteriores"]!.push(c);
  }
  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, arr]) => ({ label, items: arr }));
}

export default function ConversationSidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");

  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (res.ok) setConversations(data.conversations ?? []);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("conversations-changed", handler);
    return () => window.removeEventListener("conversations-changed", handler);
  }, [load]);

  function goTo(id: string | null) {
    router.push(id ? `/chat?id=${id}` : "/chat");
    onNavigate?.();
  }

  async function handleDelete(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setConfirmId(null);
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    } catch {
      /* si falla, el próximo load lo corrige */
    }
    if (activeId === id) goTo(null);
  }

  const groups = groupByDate(conversations);

  return (
    <div className="flex h-full flex-col bg-[var(--color-background-secondary)]">
      <div className="space-y-2 p-3">
        <button
          onClick={() => goTo(null)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-belsue px-3 py-2 text-sm font-medium text-white transition hover:bg-belsue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nueva conversación
        </button>
        <ContributeKnowledge />
        <Link
          href="/conocimiento"
          onClick={() => onNavigate?.()}
          className="block px-1 text-center text-xs font-medium text-gray-500 hover:text-belsue"
        >
          Ver conocimiento del equipo →
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-gray-200/70"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="mt-10 flex flex-col items-center px-4 text-center text-gray-400">
            <svg className="mb-2 h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            <p className="text-sm">Empieza tu primera consulta</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map((c) => {
                  const active = c.id === activeId;
                  return (
                    <li key={c.id} className="group/item relative">
                      <button
                        onClick={() => goTo(c.id)}
                        className={`flex w-full flex-col items-start rounded-lg border-l-2 px-2.5 py-2 text-left transition ${
                          active
                            ? "border-belsue bg-[var(--color-background-primary)] shadow-sm"
                            : "border-transparent hover:bg-gray-200/50"
                        }`}
                      >
                        <span className="line-clamp-1 w-full pr-6 text-sm font-medium text-gray-800">
                          {c.title || "Nueva conversación"}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                          {formatDistanceToNow(new Date(c.last_message_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                          <span className="rounded-full bg-gray-200 px-1.5 text-[10px] text-gray-500">
                            {c.message_count}
                          </span>
                        </span>
                      </button>

                      {/* Eliminar / confirmar */}
                      {confirmId === c.id ? (
                        <div className="absolute right-1 top-1.5 flex gap-1">
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white"
                          >
                            Borrar
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="rounded bg-gray-300 px-1.5 py-0.5 text-[10px] text-gray-700"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(c.id)}
                          title="Eliminar"
                          className="absolute right-1.5 top-2.5 text-gray-300 opacity-0 transition group-hover/item:opacity-100 hover:text-red-500"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
