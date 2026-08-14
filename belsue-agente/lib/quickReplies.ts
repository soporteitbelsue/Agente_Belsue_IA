/**
 * Respuestas rápidas: el agente puede cerrar un mensaje con una línea
 *
 *   [[opciones: La lista de datos | Rellenarla contigo]]
 *
 * y la aplicación la convierte en botones. El texto de cada botón se envía tal
 * cual como siguiente mensaje, así que el modelo recibe exactamente lo que
 * escribió, sin ambigüedad.
 */

/** Marcador completo, en cualquier punto del mensaje. */
const OPTIONS_RE = /\[\[\s*opciones\s*:\s*([^\]]*)\]\]/i;

/**
 * Marcador a medio escribir al final del texto. Mientras la respuesta se
 * escribe letra a letra, el marcador llega incompleto; sin esto asomaría en
 * pantalla como texto suelto antes de cerrarse.
 */
const PARTIAL_RE = /\[\[\s*o(?:p(?:c(?:i(?:o(?:n(?:e(?:s)?)?)?)?)?)?)?\s*:?[^\]]*$/i;

/** Como mucho cuatro botones: más no caben ni ayudan a decidir. */
const MAX_OPTIONS = 4;

export interface ParsedMessage {
  /** El mensaje sin el marcador, que es lo que se muestra. */
  text: string;
  /** Etiquetas de los botones; vacío si el mensaje no ofrecía ninguno. */
  options: string[];
}

export function parseQuickReplies(content: string): ParsedMessage {
  const match = content.match(OPTIONS_RE);

  if (!match) {
    return { text: content.replace(PARTIAL_RE, "").trimEnd(), options: [] };
  }

  const options = (match[1] ?? "")
    .split("|")
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);

  return { text: content.replace(OPTIONS_RE, "").trim(), options };
}
