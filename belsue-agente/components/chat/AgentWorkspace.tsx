"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatWindow from "@/components/chat/ChatWindow";
import ConversationSidebar from "@/components/chat/ConversationSidebar";
import { scopeConfig, type AgentScope } from "@/lib/scopes";

/** Preferencia de cada persona: barra lateral plegada o desplegada. */
const SIDEBAR_COLLAPSED_KEY = "belsue:barra-plegada";

/**
 * Espacio de trabajo del agente (historial + chat + fuentes).
 *
 * Es el mismo layout para todas las pestañas: lo que cambia es el ámbito, que
 * determina el conocimiento consultado, el prompt y el historial mostrado.
 */
function Workspace({ scope }: { scope: AgentScope }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("id") ?? undefined;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Barra lateral plegada (solo escritorio): se recuerda en el navegador.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const config = scopeConfig(scope);

  const handleConversationCreated = useCallback(
    (id: string) => {
      // Actualiza la URL sin recargar la página.
      router.push(`${config.path}?id=${id}`);
      window.dispatchEvent(new CustomEvent("conversations-changed"));
    },
    [router, config.path],
  );

  return (
    <div className="ios flex h-full min-h-0">
      {/* Sidebar fijo (desktop) */}
      <aside
        className={`ios-sidebar hidden shrink-0 border-r border-ios-separator transition-[width] duration-150 md:block ${
          collapsed ? "w-[84px]" : "w-[320px]"
        }`}
      >
        <ConversationSidebar
          scope={scope}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>

      {/* Drawer (móvil) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
          />
          {/* En el cajón la barra va opaca: detrás hay un velo oscuro, no el
              chat, y el cristal se vería sucio. */}
          <aside className="animate-slide-in absolute left-0 top-0 h-full w-[85%] max-w-[320px] bg-ios-bg shadow-xl">
            <ConversationSidebar
              scope={scope}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Panel del chat */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Cabecera translúcida; en móvil lleva también el botón del historial. */}
        <ChatHeader scope={scope} onOpenSidebar={() => setDrawerOpen(true)} />

        <div className="min-h-0 flex-1">
          <ChatWindow
            scope={scope}
            conversationId={conversationId}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}

export default function AgentWorkspace({ scope }: { scope: AgentScope }) {
  return (
    <Suspense fallback={null}>
      {/* key: al cambiar de pestaña se reinicia el estado del chat. */}
      <Workspace key={scope} scope={scope} />
    </Suspense>
  );
}
