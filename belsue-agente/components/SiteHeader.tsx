"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import PortalLogo from "@/components/PortalLogo";
import { useSources } from "@/components/chat/SourcesContext";
import {
  DEFAULT_SCOPE,
  SCOPE_LIST,
  parseScope,
  type ScopeConfig,
} from "@/lib/scopes";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Páginas que pertenecen a un portal pero reciben el ámbito por query param. */
const SCOPED_PAGES = ["/documentos", "/conocimiento"];

/** Pestaña de la barra superior. La activa va en blanco sobre el granate. */
function NavTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-white text-belsue shadow-sm"
          : "text-white/90 hover:bg-white/15 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function HeaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const sources = useSources();

  // La página de login no lleva header.
  if (pathname === "/login") return null;

  const user = session?.user;

  // Portal activo: por la ruta (el chat de cada portal) o por el query param
  // (documentos y conocimiento, que son las mismas páginas para ambos).
  const portal: ScopeConfig | null =
    SCOPE_LIST.find((s) => pathname.startsWith(s.path)) ??
    (SCOPED_PAGES.some((p) => pathname.startsWith(p))
      ? SCOPE_LIST.find((s) => s.id === parseScope(searchParams.get("scope")))!
      : null);

  const inAdmin = pathname.startsWith("/admin");

  return (
    <header className="bg-belsue text-white shadow-sm">
      {/* A todo el ancho, no centrada: el contenido de la aplicación (barra
          lateral, conversación y panel de fuentes) también ocupa toda la
          pantalla, y una cabecera estrecha dejaba los lados vacíos. */}
      <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
        {/* Identidad: dentro de un portal, el logo lleva a su chat. */}
        <Link
          href={portal?.path ?? "/"}
          className="flex min-w-0 items-center gap-2.5"
        >
          <PortalLogo
            scope={portal?.id ?? (inAdmin ? "admin" : DEFAULT_SCOPE)}
          />
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold leading-tight tracking-tight">
              {portal?.title ?? (inAdmin ? "Administración" : "Asistente Belsué")}
            </span>
            {portal && (
              <span className="hidden text-xs text-white/70 sm:block">
                Asistente Belsué
              </span>
            )}
          </span>
        </Link>

        {user ? (
          <>
            {/* Navegación del portal, en pestañas: se ve dónde estás.
                `mx-auto` la deja centrada entre el logo y las acciones. */}
            <nav className="mx-auto hidden items-center gap-1 md:flex">
              {portal && (
                <>
                  <NavTab href={portal.path} active={pathname === portal.path}>
                    Chat
                  </NavTab>
                  {portal.extraLinks?.map((link) => (
                    <NavTab
                      key={link.href}
                      href={link.href}
                      active={pathname.startsWith(link.href)}
                    >
                      {link.label}
                    </NavTab>
                  ))}
                  <NavTab
                    href={`/documentos?scope=${portal.id}`}
                    active={pathname.startsWith("/documentos")}
                  >
                    Documentos
                  </NavTab>
                  <NavTab
                    href={`/conocimiento?scope=${portal.id}`}
                    active={pathname.startsWith("/conocimiento")}
                  >
                    Conocimiento
                  </NavTab>
                </>
              )}

              {user.role === "admin" && (
                <NavTab href="/admin" active={inAdmin}>
                  Administración
                </NavTab>
              )}
            </nav>

            {/* Acciones, pegadas al borde derecho. */}
            <div className="ml-auto flex items-center gap-3">
            {/* Fuentes de la respuesta: solo mientras hay un chat delante. */}
            {sources?.available && (
              <button
                onClick={() => sources.setOpen(!sources.open)}
                aria-expanded={sources.open}
                title="Ver de dónde sale la respuesta"
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                  sources.open
                    ? "bg-white text-belsue shadow-sm"
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="hidden sm:inline">Fuentes</span>
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold ${
                    sources.open
                      ? "bg-belsue/10 text-belsue"
                      : "bg-white/20 text-white"
                  }`}
                >
                  {sources.count}
                </span>
              </button>
            )}

            {/* Volver al selector de portales. */}
            {pathname !== "/" && (
              <Link
                href="/"
                title="Cambiar de portal"
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/25"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span className="hidden sm:inline">Portales</span>
              </Link>
            )}

            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                {initials(user.name ?? "?")}
              </span>
              <span className="hidden text-sm font-medium lg:inline">
                {user.name}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-sm text-white transition hover:bg-white/20"
              title="Cerrar sesión"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                />
              </svg>
              <span className="hidden sm:inline">Salir</span>
            </button>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}

export default function SiteHeader() {
  // useSearchParams necesita un límite de Suspense para no bloquear el
  // renderizado estático de las páginas que cuelgan de este layout.
  return (
    <Suspense fallback={null}>
      <HeaderInner />
    </Suspense>
  );
}
