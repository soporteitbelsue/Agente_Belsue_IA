import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistente Belsué",
  description: "Asistente interno de IA de Belsué Mediación de Seguros.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="flex h-screen flex-col bg-white text-[#1a1a1a] antialiased">
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
            <nav className="flex gap-4 text-sm text-white/90">
              <Link href="/chat" className="hover:text-white">
                Chat
              </Link>
              <Link href="/admin" className="hover:text-white">
                Administración
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
