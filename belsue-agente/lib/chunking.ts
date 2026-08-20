/**
 * Troceado de textos y cabeceras de identidad.
 *
 * Este módulo no depende de nada (ni de OpenAI, ni de Supabase, ni de rutas
 * con alias) para poder usarlo igual desde la aplicación y desde los scripts
 * de mantenimiento.
 */

/**
 * Divide el texto en fragmentos de ~chunkSize caracteres con solapamiento.
 * Intenta respetar los límites de párrafo y frase para no cortar a mitad.
 */
export function chunkText(
  text: string,
  chunkSize = 1000,
  overlap = 200,
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  // Dividimos primero por párrafos para respetar la estructura.
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > chunkSize) {
      // Párrafo demasiado largo: lo partimos por frases.
      pushCurrent();
      current = "";
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let buffer = "";
      for (const sentence of sentences) {
        if ((buffer + " " + sentence).trim().length > chunkSize && buffer) {
          chunks.push(buffer.trim());
          buffer = buffer.slice(Math.max(0, buffer.length - overlap));
        }
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
      if (buffer.trim()) current = buffer.trim();
      continue;
    }

    if ((current + "\n\n" + paragraph).trim().length > chunkSize && current) {
      pushCurrent();
      // Arranca el siguiente chunk con solapamiento del anterior.
      current = current.slice(Math.max(0, current.length - overlap)).trim();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  pushCurrent();

  return chunks;
}

/**
 * Elimina fragmentos con texto idéntico, conservando el primero.
 *
 * Hay documentos que repiten su contenido (p. ej. un PDF de 10 páginas que en
 * realidad son las mismas 2 repetidas 5 veces). Indexar las copias no aporta
 * nada: gasta embeddings y, sobre todo, llena las plazas de la búsqueda con el
 * mismo texto, dejando fuera otros documentos que sí sumarían.
 */
export function dropDuplicates(chunks: string[]): string[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = c.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface DocMeta {
  name?: string | null;
  description?: string | null;
  company?: string | null;
  category?: string | null;
  /** Curso y lección a los que pertenece, si es material de formación. */
  courseTitle?: string | null;
  lessonTitle?: string | null;
  lessonPosition?: number | null;
}

/**
 * Cabecera completa, que se fusiona con el principio del texto y se guarda
 * como parte del primer fragmento. Permite encontrar el documento por lo que
 * se escribió al subirlo, no solo por el texto extraído del archivo.
 */
export function buildMetadataHeader(doc: DocMeta | null): string {
  if (!doc) return "";
  const parts: string[] = [];
  if (doc.name) parts.push(`Título: ${doc.name}`);
  if (doc.courseTitle) parts.push(`Curso: ${doc.courseTitle}`);
  if (doc.lessonTitle) {
    const n = doc.lessonPosition;
    parts.push(
      `Lección${typeof n === "number" ? ` ${n + 1}` : ""}: ${doc.lessonTitle}`,
    );
  }
  if (doc.company) parts.push(`Compañía: ${doc.company}`);
  if (doc.category) parts.push(`Categoría: ${doc.category}`);
  if (doc.description) parts.push(`Descripción: ${doc.description}`);
  return parts.join(". ");
}

/**
 * Identidad corta que acompaña a CADA fragmento al calcular su embedding.
 *
 * Sin esto, un condicionado de 427 fragmentos solo nombraba a su compañía en
 * 13 de ellos: los otros 414 eran texto genérico de seguros idéntico al de
 * cualquier otra aseguradora, así que al preguntar "hogar de Mapfre" ganaba
 * el condicionado de Occident. Con la identidad delante, cada fragmento sabe
 * de quién es.
 *
 * Se usa solo para el embedding, no se guarda en el texto del fragmento: en
 * el panel de fuentes se sigue leyendo el contenido tal cual.
 */
export function buildChunkIdentity(doc: DocMeta | null): string {
  if (!doc) return "";
  const parts: string[] = [];
  if (doc.name) parts.push(doc.name);
  if (doc.company) parts.push(doc.company);
  if (doc.category) parts.push(doc.category);
  if (doc.courseTitle) parts.push(doc.courseTitle);
  return parts.join(" · ");
}
