"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import formadorImg from "@/imagenes/formador.png";
import { DEFAULT_SCOPE, SCOPE_LIST } from "@/lib/scopes";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function SiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();

  // La página de login no lleva header.
  if (pathname === "/login") return null;

  const user = session?.user;

  // Pestaña activa: documentos y conocimiento la arrastran para mostrar el
  // material de la pestaña desde la que se entra.
  const activeScope =
    SCOPE_LIST.find((s) => pathname.startsWith(s.path))?.id ?? DEFAULT_SCOPE;

  return (
    <header className="bg-belsue text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/chat" className="flex items-center gap-2.5">
          <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-2 ring-white/50">
            <Image
              src={formadorImg}
              alt="El Formador"
              className="h-full w-full scale-[1.7] object-cover object-[center_26%]"
              priority
            />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            El Formador
          </span>
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            {/* Pestañas del asistente: cada una con su propio conocimiento. */}
            <nav className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
              {SCOPE_LIST.map((s) => {
                const active = pathname.startsWith(s.path);
                return (
                  <Link
                    key={s.id}
                    href={s.path}
                    aria-current={active ? "page" : undefined}
                    title={s.description}
                    className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-white text-belsue shadow-sm"
                        : "text-white/90 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {s.navLabel}
                  </Link>
                );
              })}
            </nav>
            <Link
              href={`/documentos?scope=${activeScope}`}
              className="hidden text-sm text-white/90 hover:text-white sm:inline"
            >
              Documentos
            </Link>
            <Link
              href={`/conocimiento?scope=${activeScope}`}
              className="hidden text-sm text-white/90 hover:text-white sm:inline"
            >
              Conocimiento
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="hidden text-sm text-white/90 hover:text-white sm:inline"
              >
                Administración
              </Link>
            )}
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                {initials(user.name ?? "?")}
              </span>
              <span className="hidden text-sm font-medium sm:inline">
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
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
