import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import PortalLogo from "@/components/PortalLogo";
import { SCOPE_LIST, type AgentScope } from "@/lib/scopes";

/**
 * Puerta de entrada: al iniciar sesión se elige portal. Cada uno es un espacio
 * independiente, con su propio conocimiento, su historial y sus documentos.
 */

/** Qué se puede hacer dentro de cada portal (para el detalle de la tarjeta). */
const PORTAL_HIGHLIGHTS: Record<AgentScope, string[]> = {
  seguros: [
    "Coberturas, exclusiones y condicionados",
    "Comparativas entre compañías",
    "Argumentarios y objeciones de venta",
  ],
  procedimientos: [
    "Cómo nos organizamos y quién lleva cada cosa",
    "Pasos de los trámites internos",
    "Cursos de formación interna, con su seguimiento",
  ],
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  // Sin sesión no hay portales que elegir (el middleware ya filtra, esto es
  // el cinturón de seguridad).
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "admin";
  const firstName = session.user.name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center overflow-y-auto px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-800 sm:text-3xl">
          {firstName ? `Hola, ${firstName}` : "Hola"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          ¿Con qué quieres trabajar hoy? Cada portal tiene su propia información:
          lo que subas en uno no se mezcla con el otro.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SCOPE_LIST.map((portal) => (
          <Link
            key={portal.id}
            href={portal.path}
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-belsue/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-belsue"
          >
            <div className="mb-4 flex items-center gap-4">
              <PortalLogo
                scope={portal.id}
                className="h-16 w-16 ring-2 ring-belsue/20"
              />
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  {portal.title}
                </h2>
                <p className="text-sm text-gray-500">{portal.description}</p>
              </div>
            </div>

            <ul className="mb-5 space-y-1.5 text-sm text-gray-600">
              {PORTAL_HIGHLIGHTS[portal.id].map((item) => (
                <li key={item} className="flex gap-2">
                  <svg className="mt-1 h-3.5 w-3.5 shrink-0 text-belsue" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>

            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-belsue">
              Entrar
              <svg className="h-4 w-4 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <Link
          href="/admin"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-4 text-sm transition hover:border-belsue/40 hover:shadow-sm"
        >
          <span>
            <span className="font-semibold text-gray-800">Administración</span>
            <span className="ml-2 text-gray-500">
              Documentos de ambos portales, usuarios y métricas
            </span>
          </span>
          <svg className="h-4 w-4 shrink-0 text-belsue" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      )}
    </div>
  );
}
