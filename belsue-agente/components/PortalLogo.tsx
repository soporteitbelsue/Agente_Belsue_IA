import Image, { type StaticImageData } from "next/image";
import formadorImg from "@/imagenes/formador.png";
import formadorInternoImg from "@/imagenes/formador_interno.png";
import ajustesImg from "@/imagenes/ajustes_formador.png";
import { parseScope, type AgentScope } from "@/lib/scopes";

/** Administración no es un portal, pero también tiene su imagen. */
export type LogoKey = AgentScope | "admin";

/**
 * Logo de cada portal (y de Administración), dentro de su recuadro.
 *
 * Cada imagen encaja distinto: la mascota de El Formador es una foto y hay que
 * acercarla y recortarla para que llene el hueco, mientras que el bloc de
 * Procedimientos y los engranajes de Administración son ilustraciones
 * completas que se verían cortadas con ese trato, así que van enteras.
 */
const LOGOS: Record<LogoKey, { src: StaticImageData; fit: string }> = {
  seguros: {
    src: formadorImg,
    fit: "scale-[1.7] object-cover object-[center_26%]",
  },
  procedimientos: {
    src: formadorInternoImg,
    fit: "object-contain p-1",
  },
  admin: {
    src: ajustesImg,
    fit: "object-contain p-1",
  },
};

export default function PortalLogo({
  scope,
  className = "h-11 w-11 rounded-full bg-white shadow-sm ring-2 ring-white/50",
}: {
  scope: unknown;
  /** Tamaño, forma y fondo del recuadro que envuelve la imagen. */
  className?: string;
}) {
  const logo = scope === "admin" ? LOGOS.admin : LOGOS[parseScope(scope)];
  return (
    <span className={`block shrink-0 overflow-hidden ${className}`}>
      <Image
        src={logo.src}
        alt=""
        className={`h-full w-full ${logo.fit}`}
        priority
      />
    </span>
  );
}
