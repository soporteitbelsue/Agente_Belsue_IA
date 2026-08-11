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
    "Cursos de formación interna, con seguimiento",
  ],
};

function Check() {
  return (
    <svg
      className="mt-[3px] h-3.5 w-3.5 shrink-0 text-belsue"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={3}
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

/** Tarjeta de acceso. El icono lo pone quien la usa (imagen o dibujo). */
function PortalCard({
  href,
  icon,
  title,
  description,
  highlights,
  /** Posición en la fila: retrasa su entrada para que aparezcan en cascada. */
  index,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  highlights: string[];
  index: number;
}) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${index * 0.09}s` }}
      className="animate-rise group flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:ring-belsue/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-belsue"
    >
      {icon}

      <h2 className="mt-4 text-lg font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-500">{description}</p>

      <ul className="mt-4 space-y-2 text-sm text-gray-600">
        {highlights.map((item) => (
          <li key={item} className="flex gap-2">
            <Check />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <span className="mt-6 inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-belsue">
        Entrar
        <svg
          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </span>
    </Link>
  );
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  // Sin sesión no hay portales que elegir (el middleware ya filtra, esto es
  // el cinturón de seguridad).
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "admin";
  const firstName = session.user.name?.trim().split(/\s+/)[0];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-belsue-50/50">
      {/* Formas de fondo, muy tenues: dan color sin restar legibilidad. */}
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-belsue-100/40 blur-[2px]"
      />
      <div
        aria-hidden
        style={{ animationDelay: "-13s" }}
        className="animate-drift pointer-events-none absolute -bottom-48 -left-40 h-[30rem] w-[30rem] rounded-full bg-belsue-100/25"
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-12">
        <div className="animate-rise mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {firstName ? `Hola, ${firstName}` : "Hola"}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500 sm:text-base">
            ¿Con qué quieres trabajar hoy? Cada portal tiene su propia
            información: lo que subas en uno no se mezcla con el otro.
          </p>
        </div>

        <div
          className={`grid gap-5 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-3" : "lg:mx-auto lg:max-w-3xl"}`}
        >
          {SCOPE_LIST.map((portal, i) => (
            <PortalCard
              key={portal.id}
              index={i + 1}
              href={portal.path}
              title={portal.title}
              description={portal.description}
              highlights={PORTAL_HIGHLIGHTS[portal.id]}
              icon={
                <PortalLogo
                  scope={portal.id}
                  className="h-14 w-14 rounded-2xl bg-belsue-50 p-1.5 ring-1 ring-belsue/10"
                />
              }
            />
          ))}

          {isAdmin && (
            <PortalCard
              index={SCOPE_LIST.length + 1}
              href="/admin"
              title="Administración"
              description="Documentos de ambos portales, usuarios y métricas de uso."
              highlights={[
                "Documentos de ambos portales",
                "Gestión de usuarios",
                "Métricas de uso",
              ]}
              icon={
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 ring-1 ring-black/5">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </span>
              }
            />
          )}
        </div>
      </div>

      <footer className="relative pb-6 text-center text-xs text-gray-400">
        Asistente Belsué · {SCOPE_LIST.map((s) => s.title).join(" + ")}
      </footer>
    </div>
  );
}
