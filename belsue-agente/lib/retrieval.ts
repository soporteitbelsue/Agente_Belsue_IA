import { supabaseServer } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import type { MatchChunkRow, Source } from "@/types";

// Umbral de similitud coseno. Con text-embedding-3-small el contenido
// realmente relevante suele puntuar en torno a 0.4-0.7, por lo que un
// umbral de 0.7 descartaba casi todo. 0.4 da buen recall sin traer ruido.
const MATCH_THRESHOLD = 0.4;

/**
 * Recupera los fragmentos más relevantes para una consulta (RAG).
 * Genera el embedding de la query y llama a la función SQL `match_chunks`.
 */
export async function retrieveRelevantChunks(
  query: string,
  matchCount = 5,
): Promise<Source[]> {
  const supabase = supabaseServer();
  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: matchCount,
  });

  if (error) {
    throw new Error(`Error en match_chunks: ${error.message}`);
  }

  const rows = (data ?? []) as MatchChunkRow[];

  return rows.map((row) => ({
    documentName: row.document_name,
    company: row.document_company ?? undefined,
    category: row.document_category ?? undefined,
    content: row.content,
    similarity: row.similarity,
  }));
}
