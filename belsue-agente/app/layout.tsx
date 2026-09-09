import type { Metadata } from "next";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import SiteHeader from "@/components/SiteHeader";
import { SourcesProvider } from "@/components/chat/SourcesContext";
import CategoriesProvider from "@/components/CategoriesProvider";
import { loadCategories } from "@/lib/categoriesServer";

/**
 * Nada de prerenderizar en compilación.
 *
 * El layout lee las categorías de la base de datos y las reparte a toda la
 * aplicación. Si las páginas se generasen estáticas, esa lista se quedaría
 * congelada en el momento de compilar: crear una categoría desde el panel no
 * se vería hasta el siguiente despliegue, que es justo lo que este cambio
 * venía a evitar. Es un portal tras login, así que la página estática no
 * ahorraba nada.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Asistente Belsué",
  description: "Asistente interno de IA de Belsué Mediación de Seguros.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Las categorías se leen aquí, en el servidor, y bajan ya cargadas: los
  // desplegables y los distintivos las necesitan nada más pintar.
  const categories = await loadCategories();

  return (
    <html lang="es">
      <body className="flex h-screen flex-col bg-white text-[#1a1a1a] antialiased">
        <SessionWrapper>
          <CategoriesProvider initial={categories}>
            {/* El botón de fuentes vive en la cabecera y el panel en el chat. */}
            <SourcesProvider>
              <SiteHeader />
              <main className="flex min-h-0 flex-1 flex-col">{children}</main>
            </SourcesProvider>
          </CategoriesProvider>
        </SessionWrapper>
      </body>
    </html>
  );
}
