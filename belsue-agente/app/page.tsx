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

/**
 * Puntos del fondo. Cada uno con su sitio, su tamaño y sus ritmos: los dos
 * valores de duración y retardo corresponden a las dos animaciones que llevan
 * encima (flotar y parpadear). Al no ser múltiplos entre sí, la combinación
 * tarda muchísimo en repetirse y no se percibe el bucle.
 */
const DOTS: {
  style: React.CSSProperties;
  delay: string;
  duration: string;
}[] = [
  { style: { left: "12%", top: "18%", width: 12, height: 12 }, delay: "0s, 0s", duration: "13s, 8s" },
  { style: { right: "18%", top: "26%", width: 8, height: 8 }, delay: "-4s, -2s", duration: "10s, 6.5s" },
  { style: { left: "28%", bottom: "16%", width: 10, height: 10 }, delay: "-8s, -5s", duration: "15s, 9s" },
  { style: { right: "30%", bottom: "24%", width: 6, height: 6 }, delay: "-6s, -3s", duration: "11s, 7s" },
  { style: { left: "46%", top: "10%", width: 7, height: 7 }, delay: "-2s, -6s", duration: "12s, 8.5s" },
  { style: { right: "10%", top: "52%", width: 9, height: 9 }, delay: "-9s, -4s", duration: "14s, 7.5s" },
  { style: { left: "6%", bottom: "34%", width: 5, height: 5 }, delay: "-5s, -1s", duration: "9s, 6s" },
];

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
      {/* El icono se inclina y crece un poco al pasar por encima. */}
      <span className="inline-block transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
        {icon}
      </span>

      <h2 className="mt-4 text-lg font-bold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-500">{description}</p>

      <ul className="mt-4 space-y-2 text-sm text-gray-600">
        {highlights.map((item, i) => (
          <li
            key={item}
            // Los puntos se van escribiendo detrás de la tarjeta que los trae.
            style={{ animationDelay: `${index * 0.09 + 0.2 + i * 0.08}s` }}
            className="animate-rise flex gap-2"
          >
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
      {/* Formas de fondo, muy tenues: dan color y movimiento sin restar
          legibilidad ni competir con las tarjetas. Los desfases negativos
          arrancan cada una en un punto distinto de su recorrido, para que no
          se muevan todas a la vez. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-drift absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-belsue-100/40 blur-[2px]" />
        <div
          style={{ animationDelay: "-13s" }}
          className="animate-drift absolute -bottom-48 -left-40 h-[30rem] w-[30rem] rounded-full bg-belsue-100/25"
        />

        {/* Forma irregular que gira: al no ser redonda, parece deformarse. */}
        <div className="animate-spin-slow absolute -left-24 top-1/3 h-72 w-72 rounded-[42%_58%_54%_46%/48%_44%_56%_52%] bg-belsue/[0.04]" />
        <div
          style={{ animationDelay: "-25s" }}
          className="animate-spin-slow absolute -right-16 bottom-10 h-64 w-64 rounded-[55%_45%_40%_60%/50%_55%_45%_50%] bg-belsue/[0.05]"
        />

        {/* Auroras: manchas grandes y difuminadas que vagan por el fondo. */}
        <div className="animate-aurora absolute left-[8%] top-[8%] h-80 w-80 rounded-full bg-belsue-100/35 blur-3xl" />
        <div
          style={{ animationDelay: "-17s" }}
          className="animate-aurora absolute right-[6%] bottom-[6%] h-96 w-96 rounded-full bg-belsue/[0.06] blur-3xl"
        />

        {/* Puntos flotando y parpadeando, cada uno a su ritmo. */}
        {DOTS.map((dot, i) => (
          <div
            key={i}
            style={{
              ...dot.style,
              animationDelay: dot.delay,
              animationDuration: dot.duration,
            }}
            className="animate-float-twinkle absolute rounded-full bg-belsue/40"
          />
        ))}
      </div>

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
                <PortalLogo
                  scope="admin"
                  className="h-14 w-14 rounded-2xl bg-gray-100 p-1.5 ring-1 ring-black/5"
                />
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
