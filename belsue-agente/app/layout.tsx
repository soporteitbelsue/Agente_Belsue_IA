import type { Metadata } from "next";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import SiteHeader from "@/components/SiteHeader";
import { SourcesProvider } from "@/components/chat/SourcesContext";

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
        <SessionWrapper>
          {/* El botón de fuentes vive en la cabecera y el panel en el chat. */}
          <SourcesProvider>
            <SiteHeader />
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </SourcesProvider>
        </SessionWrapper>
      </body>
    </html>
  );
}
