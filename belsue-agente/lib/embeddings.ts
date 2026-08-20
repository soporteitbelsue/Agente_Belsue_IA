import { openai, EMBEDDING_MODEL } from "@/lib/openai";
import { supabaseServer } from "@/lib/supabase";
import { extractTextFromBuffer, extractTextFromFile } from "@/lib/parsers";
import {
  buildChunkIdentity,
  buildMetadataHeader,
  chunkText,
  dropDuplicates,
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

interface ChunkRecord {
  document_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
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
 * Trocea un texto ya extraído, genera los embeddings y los guarda en
 * `document_chunks` en lotes de 20. Reemplaza los fragmentos previos del
 * documento, así que reprocesar es idempotente.
 */
async function storeTextAsChunks(
  documentId: string,
  text: string,
): Promise<void> {
  const supabase = supabaseServer();

  // Fusionamos la cabecera con el texto ANTES de trocear: así el primer
  // fragmento contiene título + descripción + el inicio del contenido juntos.
  // (Antes iban en fragmentos separados: si el título casaba con la consulta
  // pero el contenido no, los pasos quedaban huérfanos y no se recuperaban.)
  const meta = await fetchDocMeta(documentId);
  const header = buildMetadataHeader(meta);
  const fullText = header ? `${header}\n\n${text}` : text;
  const chunks = dropDuplicates(chunkText(fullText));
  if (chunks.length === 0) {
    throw new Error("No se pudo extraer texto del documento.");
  }

  // Identidad corta que se antepone a CADA fragmento al calcular su embedding.
  const identity = buildChunkIdentity(meta);

  // Limpia chunks previos del documento (reprocesado idempotente).
  await supabase.from("document_chunks").delete().eq("document_id", documentId);

  const BATCH_SIZE = 20;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const records: ChunkRecord[] = await Promise.all(
      batch.map(async (content, offset) => ({
        document_id: documentId,
        // Se guarda el texto tal cual: la identidad es solo para buscar, y en
        // el panel de fuentes se lee el contenido limpio.
        content,
        embedding: await generateEmbedding(
          identity ? `${identity}\n${content}` : content,
        ),
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
