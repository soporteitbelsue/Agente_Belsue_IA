import type { Metadata } from "next";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import SiteHeader from "@/components/SiteHeader";

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
          <SiteHeader />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </SessionWrapper>
      </body>
    </html>
  );
}
