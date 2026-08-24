/**
 * Enlaces de vídeo.
 *
 * Los vídeos de formación se alojan en YouTube (o Vimeo) y aquí solo se guarda
 * su URL: alojarlos nosotros se comería el espacio de Storage, y además esas
 * plataformas ya resuelven la reproducción, la calidad según la conexión y el
 * móvil.
 *
 * De la URL que pega el usuario hay que sacar la de incrustar, que es distinta
 * y no se puede adivinar: youtu.be/ABC, youtube.com/watch?v=ABC y
 * youtube.com/shorts/ABC son el mismo vídeo con tres direcciones.
 */

export interface VideoLink {
  provider: "youtube" | "vimeo";
  id: string;
  /** URL para el <iframe>. */
  embedUrl: string;
  /** URL para abrir el vídeo en su web. */
  watchUrl: string;
}

const YOUTUBE = [
  /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([\w-]{6,})/i,
  /youtu\.be\/([\w-]{6,})/i,
  /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([\w-]{6,})/i,
  /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([\w-]{6,})/i,
  /(?:youtube\.com|youtube-nocookie\.com)\/live\/([\w-]{6,})/i,
];

const VIMEO = /vimeo\.com\/(?:video\/)?(\d{6,})/i;

/** Devuelve null si la URL no es de una plataforma reconocida. */
export function parseVideoUrl(raw: string): VideoLink | null {
  const url = raw.trim();
  if (!url) return null;

  for (const patron of YOUTUBE) {
    const match = url.match(patron);
    if (match?.[1]) {
      const id = match[1];
      return {
        provider: "youtube",
        id,
        // nocookie: no deja rastro publicitario en el navegador de quien mira.
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
        watchUrl: `https://www.youtube.com/watch?v=${id}`,
      };
    }
  }

  const vimeo = url.match(VIMEO);
  if (vimeo?.[1]) {
    return {
      provider: "vimeo",
      id: vimeo[1],
      embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`,
      watchUrl: `https://vimeo.com/${vimeo[1]}`,
    };
  }

  return null;
}

/** Miniatura del vídeo, para el listado. Vimeo la necesitaría por API. */
export function videoThumbnail(link: VideoLink): string | null {
  return link.provider === "youtube"
    ? `https://i.ytimg.com/vi/${link.id}/mqdefault.jpg`
    : null;
}
