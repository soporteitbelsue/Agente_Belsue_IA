import { openai, EMBEDDING_MODEL } from "@/lib/openai";
import { supabaseServer } from "@/lib/supabase";
import {
  extractSegments,
  extractTextFromFile,
  type TextSegment,
} from "@/lib/parsers";
import {
  buildChunkIdentity,
  buildMetadataHeader,
  chunkText,
  type DocMeta,
} from "@/lib/chunking";

export { chunkText };

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

/** Textos por petición de embeddings (la API admite listas). */
const EMBED_BATCH = 50;
/** Filas por inserción en la BBDD. */
const INSERT_BATCH = 50;

/** Embeddings de varios textos, en el mismo orden. */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH).map((t) => t.replace(/\n/g, " "));
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    if (sorted.length !== batch.length) {
      throw new Error("OpenAI no devolvió todos los embeddings.");
    }
    out.push(...sorted.map((d) => d.embedding));
  }
  return out;
}

/** Qué ha salido de indexar un documento. */
export interface IndexStats {
  chunks: number;
  /** Solo en PDF: páginas totales y leídas con visión. */
  pages?: number;
  visionPages?: number;
}

/**
 * Trocea el texto (por páginas si las hay), genera los embeddings y los guarda
 * en `document_chunks`, sustituyendo los fragmentos previos del documento.
 *
 * Todo se prepara ANTES de borrar nada: si falla OpenAI a mitad, el documento
 * conserva sus fragmentos anteriores en vez de quedarse vacío.
 */
async function storeSegmentsAsChunks(
  documentId: string,
  segments: TextSegment[],
): Promise<number> {
  const supabase = supabaseServer();

  // La cabecera (título, compañía, descripción) va delante del primer trozo:
  // así el primer fragmento contiene título + inicio del contenido juntos.
  // (Si iban separados y el título casaba con la consulta pero el contenido
  // no, los pasos quedaban huérfanos y no se recuperaban.)
  const meta = await fetchDocMeta(documentId);
  const header = buildMetadataHeader(meta);

  // Cada página se trocea por separado para saber de qué página sale cada
  // fragmento (y poder abrir el PDF justo ahí).
  const pieces: { content: string; page: number | null }[] = [];
  const seen = new Set<string>();
  segments.forEach((segment, i) => {
    const text = i === 0 && header ? `${header}\n\n${segment.text}` : segment.text;
    for (const content of chunkText(text)) {
      // Fuera los fragmentos repetidos (PDFs con páginas duplicadas).
      const key = content.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      pieces.push({ content, page: segment.page });
    }
  });
  if (pieces.length === 0) {
    throw new Error("No se pudo extraer texto del documento.");
  }

  // Identidad corta que se antepone a CADA fragmento al calcular su embedding
  // (no se guarda en el texto: es solo para buscar).
  const identity = buildChunkIdentity(meta);
  const embeddings = await generateEmbeddings(
    pieces.map((p) => (identity ? `${identity}\n${p.content}` : p.content)),
  );

  const records = pieces.map((p, i) => ({
    document_id: documentId,
    content: p.content,
    page: p.page,
    embedding: embeddings[i]!,
    chunk_index: i,
  }));

  await supabase.from("document_chunks").delete().eq("document_id", documentId);
  for (let i = 0; i < records.length; i += INSERT_BATCH) {
    const { error } = await supabase
      .from("document_chunks")
      .insert(records.slice(i, i + INSERT_BATCH));
    if (error) {
      throw new Error(`Error al guardar chunks: ${error.message}`);
    }
  }
  return records.length;
}

/**
 * Procesa un documento ya registrado a partir de un archivo del disco.
 * Se conserva para compatibilidad; el flujo normal usa Storage + buffer.
 */
export async function processAndStoreDocument(
  documentId: string,
  filePath: string,
  fileType: string,
): Promise<void> {
  const text = await extractTextFromFile(filePath, fileType);
  await storeSegmentsAsChunks(documentId, [{ page: null, text }]);
}

/**
 * Indexa un documento a partir de su buffer en memoria (descargado de Storage).
 * Los PDF se leen página a página, con visión para tablas y escaneados.
 */
export async function processAndStoreBuffer(
  documentId: string,
  buffer: Buffer,
  fileType: string,
): Promise<IndexStats> {
  const { segments, stats } = await extractSegments(buffer, fileType);
  const chunks = await storeSegmentsAsChunks(documentId, segments);
  return { chunks, pages: stats?.pages, visionPages: stats?.visionPages };
}

/**
 * Indexa una nota de conocimiento: texto introducido a mano (sin archivo).
 */
export async function processAndStoreText(
  documentId: string,
  text: string,
): Promise<void> {
  await storeSegmentsAsChunks(documentId, [{ page: null, text }]);
}
