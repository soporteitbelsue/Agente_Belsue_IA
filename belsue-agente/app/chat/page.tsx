"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ChatWindow from "@/components/chat/ChatWindow";
import ConversationSidebar from "@/components/chat/ConversationSidebar";

function ChatLayout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("id") ?? undefined;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleConversationCreated = useCallback(
    (id: string) => {
      // Actualiza la URL sin recargar la página.
      router.push(`/chat?id=${id}`);
      window.dispatchEvent(new CustomEvent("conversations-changed"));
    },
    [router],
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar fijo (desktop) */}
      <aside className="hidden w-[260px] shrink-0 border-r border-gray-200 md:block">
        <ConversationSidebar />
      </aside>

      {/* Drawer (móvil) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[80%] max-w-[300px] border-r border-gray-200 shadow-xl">
            <ConversationSidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Panel del chat */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Barra superior solo en móvil para abrir el historial */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
            aria-label="Abrir historial"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-600">Historial</span>
        </div>

        <div className="min-h-0 flex-1">
          <ChatWindow
            conversationId={conversationId}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatLayout />
    </Suspense>
  );
}
