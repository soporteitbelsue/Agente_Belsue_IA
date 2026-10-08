"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useSources } from "./SourcesContext";
import { scopeConfig, type AgentScope } from "@/lib/scopes";

/** Icono de trazo (Heroicons, 24px, contorno) con el grosor del chat. */
function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  menu: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5",
  more: "M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
  sources:
    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  link: "M8.25 4.5l7.5 7.5-7.5 7.5",
  portals:
    "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  account:
    "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  logout:
    "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75",
};

const ITEM =
  "flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] text-ios-label transition-colors duration-150 hover:bg-ios-fill";

/** Fila del menú: enlace o botón con icono a la izquierda. */
function MenuRow({
  icon,
  href,
  onClick,
  trailing,
  children,
}: {
  icon: string;
  href?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const content = (
    <>
      <span className="text-ios-secondary">
        <Icon d={icon} />
      </span>
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </>
  );
  return href ? (
    <Link href={href} onClick={onClick} className={ITEM}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={ITEM}>
      {content}
    </button>
  );
}

/**
 * Cabecera translúcida de la pantalla de chat. Sustituye en estas pantallas a
 * la barra granate común: la navegación, las fuentes, la cuenta y la salida
 * pasan al menú de opciones de la derecha.
 */
export default function ChatHeader({
  scope,
  onOpenSidebar,
}: {
  scope: AgentScope;
  /** Abre el historial en pantallas estrechas. */
  onOpenSidebar: () => void;
}) {
  const config = scopeConfig(scope);
  const { data: session } = useSession();
  const user = session?.user;
  const sources = useSources();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // El menú se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <header className="ios-bar sticky top-0 z-30 border-b border-ios-separator">
      <div className="flex h-16 items-center gap-3 px-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Abrir historial"
          className="-ml-1 flex h-11 w-11 items-center justify-center rounded-full text-ios-accent transition-colors duration-150 hover:bg-ios-fill md:hidden"
        >
          <Icon d={ICONS.menu} className="h-6 w-6" />
        </button>

        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-accent text-[17px] font-semibold text-white"
        >
          B
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight text-ios-label">
            Asistente Belsué
          </p>
          <p className="truncate text-[13px] leading-tight text-ios-secondary">
            {config.title}
          </p>
        </div>

        <div ref={menuRef} className="relative">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Opciones"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-ios-accent transition-colors duration-150 ${
              menuOpen ? "bg-ios-fill-hover" : "bg-ios-fill hover:bg-ios-fill-hover"
            }`}
          >
            <Icon d={ICONS.more} className="h-6 w-6" />
          </button>

          {menuOpen && (
            <div className="animate-rise absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-card border border-ios-separator bg-ios-surface py-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
              {sources?.available && (
                <MenuRow
                  icon={ICONS.sources}
                  onClick={() => {
                    sources.setOpen(!sources.open);
                    close();
                  }}
                  trailing={
                    <span className="rounded-full bg-ios-fill px-2 text-[13px] text-ios-secondary">
                      {sources.count}
                    </span>
                  }
                >
                  {sources.open ? "Ocultar fuentes" : "Ver fuentes"}
                </MenuRow>
              )}

              <div className="my-1 border-t border-ios-separator" />
              {config.extraLinks?.map((link) => (
                <MenuRow key={link.href} icon={ICONS.link} href={link.href} onClick={close}>
                  {link.label}
                </MenuRow>
              ))}
              <MenuRow icon={ICONS.link} href={`/conocimiento?scope=${scope}`} onClick={close}>
                Conocimiento
              </MenuRow>
              {user?.role === "admin" && (
                <MenuRow icon={ICONS.link} href="/admin" onClick={close}>
                  Administración
                </MenuRow>
              )}
              <MenuRow icon={ICONS.portals} href="/" onClick={close}>
                Cambiar de portal
              </MenuRow>

              <div className="my-1 border-t border-ios-separator" />
              {user && (
                <MenuRow icon={ICONS.account} href="/cuenta/contrasena" onClick={close}>
                  <span className="block truncate">{user.name}</span>
                  <span className="block text-[13px] text-ios-secondary">
                    Cambiar contraseña
                  </span>
                </MenuRow>
              )}
              <MenuRow icon={ICONS.logout} onClick={() => signOut({ callbackUrl: "/login" })}>
                Cerrar sesión
              </MenuRow>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
