"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

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

  return (
    <header className="bg-belsue text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/chat" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Asistente Belsué
          </span>
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/25"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              Chat
            </Link>
            <Link
              href="/documentos"
              className="hidden text-sm text-white/90 hover:text-white sm:inline"
            >
              Documentos
            </Link>
            <Link
              href="/conocimiento"
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
