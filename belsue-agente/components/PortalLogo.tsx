import Image, { type StaticImageData } from "next/image";
import formadorImg from "@/imagenes/formador.png";
import formadorInternoImg from "@/imagenes/formador_interno.png";
import { parseScope, type AgentScope } from "@/lib/scopes";

/**
 * Logo de cada portal, dentro de un círculo blanco.
 *
 * Cada imagen encaja distinto: la mascota de El Formador es una foto y hay que
 * acercarla y recortarla para que llene el círculo, mientras que el bloc de
 * Procedimientos es una ilustración completa que se vería cortada si se
 * tratara igual, así que se muestra entera.
 */
const LOGOS: Record<AgentScope, { src: StaticImageData; fit: string }> = {
  seguros: {
    src: formadorImg,
    fit: "scale-[1.7] object-cover object-[center_26%]",
  },
  procedimientos: {
    src: formadorInternoImg,
    fit: "object-contain p-1",
  },
};

export default function PortalLogo({
  scope,
  className = "h-11 w-11 ring-2 ring-white/50",
}: {
  scope: unknown;
  /** Tamaño y borde del círculo. */
  className?: string;
}) {
  const logo = LOGOS[parseScope(scope)];
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full bg-white shadow-sm ${className}`}
    >
      <Image
        src={logo.src}
        alt=""
        className={`h-full w-full ${logo.fit}`}
        priority
      />
    </span>
  );
}
