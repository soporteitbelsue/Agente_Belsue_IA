"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useSources } from "./SourcesContext";
import PortalLogo from "@/components/PortalLogo";
import { SCOPE_LIST, scopeConfig, type AgentScope } from "@/lib/scopes";

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
  check: "M4.5 12.75l6 6 9-13.5",
};

/** Cierra un menú desplegable al pulsar fuera o con Escape. */
function useDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  menuRef: RefObject<HTMLElement>,
  buttonRef: RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, menuRef, buttonRef]);
}

const DROPDOWN =
  "animate-rise absolute right-0 top-full z-40 mt-2 overflow-hidden rounded-card border border-ios-separator bg-ios-surface py-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]";

/** Fila del selector de portales: logo, nombre y una marca en el actual. */
function PortalRow({
  logo,
  href,
  title,
  current,
  onClick,
}: {
  logo: AgentScope | "admin";
  href: string;
  title: string;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`${ITEM} ${current ? "font-semibold" : ""}`}
    >
      <PortalLogo scope={logo} className="h-8 w-8 rounded-lg bg-[#fff]" />
      <span className="flex-1 truncate">{title}</span>
      {current && (
        <span className="text-ios-accent">
          <Icon d={ICONS.check} />
        </span>
      )}
    </Link>
  );
}

/** Iniciales para el avatar del usuario ("Cecilia Ferraz" → "CF"). */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const ITEM =
  "flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] text-ios-label transition-colors duration-150 hover:bg-ios-fill";

/** Fila del menú: enlace o botón con icono a la izquierda. */
function MenuRow({
  icon,
  href,
  onClick,
  trailing,
  className = "",
  children,
}: {
  icon: string;
  href?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  className?: string;
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
    <Link href={href} onClick={onClick} className={`${ITEM} ${className}`}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${ITEM} ${className}`}>
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
  useDismiss(menuOpen, setMenuOpen, menuRef, buttonRef);

  const [portalsOpen, setPortalsOpen] = useState(false);
  const portalsRef = useRef<HTMLDivElement>(null);
  const portalsButtonRef = useRef<HTMLButtonElement>(null);
  useDismiss(portalsOpen, setPortalsOpen, portalsRef, portalsButtonRef);

  const close = () => setMenuOpen(false);
  const closePortals = () => setPortalsOpen(false);

  return (
    // Superpuesta al chat (absolute): los mensajes pasan por debajo y se
    // intuyen a través del cristal.
    <header className="ios-bar absolute inset-x-0 top-0 z-30 border-b border-ios-separator">
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

        {/* Cambiar de portal: siempre a la vista, no escondido en el menú.
            Despliega los portales para saltar directamente, sin pasar por la
            pantalla de inicio. */}
        <div ref={portalsRef} className="relative shrink-0">
          <button
            ref={portalsButtonRef}
            type="button"
            onClick={() => setPortalsOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={portalsOpen}
            aria-label="Cambiar de portal"
            title="Cambiar de portal"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-ios-accent transition-colors duration-150 ${
              portalsOpen ? "bg-ios-fill-hover" : "bg-ios-fill hover:bg-ios-fill-hover"
            }`}
          >
            <Icon d={ICONS.portals} />
          </button>

          {portalsOpen && (
            <div className={`${DROPDOWN} w-64`}>
              <p className="px-4 pb-1 pt-2 text-[13px] font-semibold text-ios-secondary">
                Portales
              </p>
              {SCOPE_LIST.map((portal) => (
                <PortalRow
                  key={portal.id}
                  logo={portal.id}
                  href={portal.path}
                  title={portal.title}
                  current={portal.id === scope}
                  onClick={closePortals}
                />
              ))}
              {user?.role === "admin" && (
                <PortalRow
                  logo="admin"
                  href="/admin"
                  title="Administración"
                  current={false}
                  onClick={closePortals}
                />
              )}
            </div>
          )}
        </div>

        {/* Usuario: lleva a su cuenta (cambiar contraseña). En móvil no cabe
            y queda dentro del menú de opciones. */}
        {user && (
          <Link
            href="/cuenta/contrasena"
            title="Mi cuenta · cambiar contraseña"
            className="hidden h-11 shrink-0 items-center gap-2 rounded-full pl-0.5 pr-0.5 transition-colors duration-150 hover:bg-ios-fill sm:flex lg:pr-3.5"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ios-fill-hover text-[13px] font-semibold text-ios-label"
            >
              {initials(user.name ?? "?")}
            </span>
            <span className="hidden max-w-[160px] truncate text-[15px] font-medium text-ios-label lg:inline">
              {user.name}
            </span>
            <span className="sr-only lg:hidden">{user.name}, mi cuenta</span>
          </Link>
        )}

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
            <div className={`${DROPDOWN} w-72`}>
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

              {sources?.available && <div className="my-1 border-t border-ios-separator" />}
              {!!config.extraLinks?.length && (
                <>
                  {config.extraLinks.map((link) => (
                    <MenuRow key={link.href} icon={ICONS.link} href={link.href} onClick={close}>
                      {link.label}
                    </MenuRow>
                  ))}
                  <div className="my-1 border-t border-ios-separator" />
                </>
              )}
              {/* En pantallas anchas el usuario ya está en la cabecera. */}
              {user && (
                <MenuRow icon={ICONS.account} href="/cuenta/contrasena" onClick={close} className="sm:hidden">
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
