import { openai, EMBEDDING_MODEL } from "@/lib/openai";
import { supabaseServer } from "@/lib/supabase";
import { extractTextFromBuffer, extractTextFromFile } from "@/lib/parsers";

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

/** Genera el embedding de un texto con el modelo configurado. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.replace(/\n/g, " "),
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("OpenAI no devolvió ningún embedding.");
  }
  return embedding;
}

interface ChunkRecord {
  document_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
}

/**
 * Trocea un texto ya extraído, genera los embeddings y los guarda en
 * `document_chunks` en lotes de 20. Reemplaza los chunks previos del
 * documento (idempotente).
 */
interface DocMeta {
  name?: string | null;
  description?: string | null;
  company?: string | null;
  category?: string | null;
  /** Curso y lección a los que pertenece, si el documento es material de un curso. */
  courseTitle?: string | null;
  lessonTitle?: string | null;
  lessonPosition?: number | null;
}

/**
 * Construye el texto de la cabecera de metadatos que se indexa como primer
 * fragmento (título, compañía, categoría y DESCRIPCIÓN). Permite localizar el
 * documento por lo que el usuario escribe al subirlo, no solo por el texto
 * extraído del archivo (que en formularios es muy pobre).
 *
 * Si el documento es una lección, se nombran el curso y la lección: así el
 * agente puede responder remitiendo al punto exacto de la formación.
 */
function buildMetadataHeader(doc: DocMeta | null): string {
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

interface LessonJoin {
  title: string | null;
  position: number | null;
  courses: { title: string } | null;
}

async function fetchDocMeta(documentId: string): Promise<DocMeta | null> {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("documents")
    .select("name, description, company, category")
    .eq("id", documentId)
    .maybeSingle();
  if (!data) return null;

  // Un documento puede ser lección de un curso (o de ninguno).
  const { data: lesson } = await supabase
    .from("lessons")
    .select("title, position, courses(title)")
    .eq("document_id", documentId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const l = lesson as unknown as LessonJoin | null;

  return {
    ...(data as DocMeta),
    courseTitle: l?.courses?.title ?? null,
    lessonTitle: l?.title ?? null,
    lessonPosition: l?.position ?? null,
  };
}

/**
 * Elimina fragmentos con texto idéntico, conservando el primero.
 *
 * Hay documentos que repiten su contenido (p. ej. un PDF de 10 páginas que en
 * realidad son las mismas 2 repetidas 5 veces). Indexar las copias no aporta
 * nada: gasta embeddings y, sobre todo, llena las 8 plazas de la búsqueda con
 * el mismo texto, dejando fuera otros documentos que sí sumarían.
 */
function dropDuplicates(chunks: string[]): string[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = c.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function storeTextAsChunks(
  documentId: string,
  text: string,
): Promise<void> {
  const supabase = supabaseServer();

  // Fusionamos la cabecera con el texto ANTES de trocear: así el primer
  // fragmento contiene título + descripción + el inicio del contenido juntos.
  // (Antes iban en fragmentos separados: si el título casaba con la consulta
  // pero el contenido no, los pasos quedaban huérfanos y no se recuperaban.)
  const header = buildMetadataHeader(await fetchDocMeta(documentId));
  const fullText = header ? `${header}\n\n${text}` : text;
  const chunks = dropDuplicates(chunkText(fullText));
  if (chunks.length === 0) {
    throw new Error("No se pudo extraer texto del documento.");
  }

  // Limpia chunks previos del documento (reprocesado idempotente).
  await supabase.from("document_chunks").delete().eq("document_id", documentId);

  const BATCH_SIZE = 20;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const records: ChunkRecord[] = await Promise.all(
      batch.map(async (content, offset) => ({
        document_id: documentId,
        content,
        embedding: await generateEmbedding(content),
        chunk_index: i + offset,
      })),
    );

    const { error } = await supabase
      .from("document_chunks")
      .upsert(records, { onConflict: "id" });

    if (error) {
      throw new Error(`Error al guardar chunks: ${error.message}`);
    }
  }
}

/**
 * Procesa un documento ya registrado: extrae texto del archivo, lo trocea,
 * genera los embeddings y los guarda en `document_chunks`.
 */
export async function processAndStoreDocument(
  documentId: string,
  filePath: string,
  fileType: string,
): Promise<void> {
  const text = await extractTextFromFile(filePath, fileType);
  await storeTextAsChunks(documentId, text);
}

/**
 * Indexa un documento a partir de su buffer en memoria (descargado de Storage):
 * extrae texto, lo trocea, genera embeddings y los guarda en `document_chunks`.
 */
export async function processAndStoreBuffer(
  documentId: string,
  buffer: Buffer,
  fileType: string,
): Promise<void> {
  const text = await extractTextFromBuffer(buffer, fileType);
  await storeTextAsChunks(documentId, text);
}

/**
 * Indexa una nota de conocimiento: texto introducido a mano (sin archivo).
 * Trocea, genera embeddings y los guarda en `document_chunks`.
 */
export async function processAndStoreText(
  documentId: string,
  text: string,
): Promise<void> {
  await storeTextAsChunks(documentId, text);
}
