"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow, isToday, isThisWeek, isThisMonth } from "date-fns";
import { es } from "date-fns/locale";
import ContributeKnowledge from "@/components/chat/ContributeKnowledge";
import {
  DEFAULT_SCOPE,
  scopeConfig,
  type AgentScope,
  type ExtraLinkIcon,
} from "@/lib/scopes";
import type { Conversation } from "@/types";

/** Trazo de cada icono de las secciones extra (Heroicons, 24px, contorno). */
const EXTRA_LINK_ICONS: Record<ExtraLinkIcon, string> = {
  // Birrete
  cursos:
    "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
  // Teléfono
  contactos:
    "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z",
};

/** Iconos propios de la barra (Heroicons, contorno). */
const ICONS = {
  // Lápiz sobre cuadrado: redactar
  compose:
    "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  chevron: "M8.25 4.5l7.5 7.5-7.5 7.5",
  trash:
    "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
};

/** Botón-tesela de los accesos rápidos (Aportar, Cursos, Contactos). */
const TILE =
  "flex h-[68px] flex-col items-center justify-center gap-1 rounded-card bg-ios-surface text-xs font-medium text-ios-label shadow-ios transition-colors duration-150 hover:bg-ios-surface-hover";

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
  scope = DEFAULT_SCOPE,
  onNavigate,
}: {
  /** Pestaña activa: su historial es independiente del de la otra. */
  scope?: AgentScope;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");
  const config = scopeConfig(scope);

  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?scope=${scope}`);
      const data = await res.json();
      if (res.ok) setConversations(data.conversations ?? []);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("conversations-changed", handler);
    return () => window.removeEventListener("conversations-changed", handler);
  }, [load]);

  function goTo(id: string | null) {
    router.push(id ? `${config.path}?id=${id}` : config.path);
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

  // Búsqueda por título, en el navegador: filtra lo que ya está cargado.
  const term = query.trim().toLocaleLowerCase("es");
  const visible = term
    ? conversations.filter((c) =>
        (c.title || "Nueva conversación").toLocaleLowerCase("es").includes(term),
      )
    : conversations;
  const groups = groupByDate(visible);

  // Accesos rápidos: "Aportar" siempre y, según el portal, Cursos y Contactos.
  const tileCount = 1 + (config.extraLinks?.length ?? 0);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ios-label">
            Chats
          </h2>
          <button
            type="button"
            onClick={() => goTo(null)}
            aria-label="Nueva conversación"
            title="Nueva conversación"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-ios-fill text-ios-accent transition-colors duration-150 hover:bg-ios-fill-hover"
          >
            <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.compose} />
            </svg>
          </button>
        </div>

        <label className="flex h-11 items-center gap-2 rounded-field bg-ios-fill px-3 text-ios-secondary focus-within:bg-ios-fill-hover focus-within:outline focus-within:outline-2 focus-within:outline-ios-accent">
          <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.search} />
          </svg>
          <span className="sr-only">Buscar conversaciones</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar"
            className="ios-plain-field h-full min-w-0 flex-1 text-[15px] text-ios-label placeholder:text-ios-secondary focus:outline-none"
          />
        </label>

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${tileCount}, minmax(0, 1fr))` }}
        >
          <ContributeKnowledge scope={scope} />
          {config.extraLinks?.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => onNavigate?.()}
              className={TILE}
            >
              <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d={EXTRA_LINK_ICONS[link.icon]} />
              </svg>
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="overflow-hidden rounded-card bg-ios-surface shadow-ios">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex min-h-[60px] flex-col justify-center gap-2 px-4">
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-ios-fill" />
                <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-ios-fill" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="mt-10 flex flex-col items-center px-4 text-center text-ios-secondary">
            <svg className="mb-2 h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            <p className="text-[15px]">Empieza tu primera consulta</p>
          </div>
        ) : groups.length === 0 ? (
          <p className="mt-8 text-center text-[15px] text-ios-secondary">
            Sin resultados para «{query.trim()}»
          </p>
        ) : (
          groups.map((group, gi) => (
            <section
              key={group.label}
              className="animate-rise mb-5"
              style={{ animationDelay: `${gi * 0.06}s` }}
            >
              <h3 className="px-4 pb-1.5 text-[13px] font-semibold text-ios-secondary">
                {group.label}
              </h3>
              <ul className="overflow-hidden rounded-card bg-ios-surface shadow-ios">
                {group.items.map((c, i) => {
                  const active = c.id === activeId;
                  return (
                    <li key={c.id} className="group/item relative">
                      {/* Separador con sangría izquierda, como en iOS. */}
                      {i > 0 && (
                        <span aria-hidden className="absolute left-4 right-0 top-0 h-px bg-ios-separator" />
                      )}
                      <button
                        type="button"
                        onClick={() => goTo(c.id)}
                        aria-current={active ? "true" : undefined}
                        className={`flex min-h-[60px] w-full flex-col items-start justify-center px-4 py-2 text-left transition-colors duration-150 focus-visible:![outline-offset:-2px] ${
                          active
                            ? "bg-ios-fill-active hover:bg-ios-fill-hover"
                            : "hover:bg-ios-fill"
                        }`}
                      >
                        <span className="block w-full truncate pr-8 text-[15px] font-semibold text-ios-label">
                          {c.title || "Nueva conversación"}
                        </span>
                        <span className="mt-0.5 block w-full truncate pr-8 text-[13px] text-ios-secondary">
                          {formatDistanceToNow(new Date(c.last_message_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                          {" · "}
                          {c.message_count}{" "}
                          {c.message_count === 1 ? "mensaje" : "mensajes"}
                        </span>
                      </button>

                      {/* Eliminar / confirmar */}
                      {confirmId === c.id ? (
                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            className="rounded-full bg-red-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Borrar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="rounded-full bg-ios-surface-hover px-3 py-1.5 text-xs font-medium text-ios-label"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(c.id)}
                          aria-label="Eliminar conversación"
                          title="Eliminar"
                          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ios-secondary opacity-0 transition duration-150 hover:bg-ios-fill hover:text-red-700 focus-visible:opacity-100 group-hover/item:opacity-100"
                        >
                          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.trash} />
                          </svg>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Acceso al conocimiento del equipo, como fila con chevron. */}
      <div className="border-t border-ios-separator px-4 py-3">
        <Link
          href={`/conocimiento?scope=${scope}`}
          onClick={() => onNavigate?.()}
          className="flex min-h-[44px] items-center justify-between rounded-card bg-ios-surface px-4 text-[15px] text-ios-label shadow-ios transition-colors duration-150 hover:bg-ios-surface-hover"
        >
          {scope === "procedimientos"
            ? "Ver procedimientos del equipo"
            : "Ver conocimiento del equipo"}
          <svg className="h-4 w-4 text-ios-secondary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.chevron} />
          </svg>
        </Link>
      </div>
    </div>
  );
}
