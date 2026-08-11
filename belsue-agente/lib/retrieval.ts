import { supabaseServer } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import type { AgentScope } from "@/lib/scopes";
import type { MatchChunkRow, Source } from "@/types";

// Umbral de similitud coseno. Con text-embedding-3-small el contenido
// relevante puntúa ~0.3-0.7. Con 0.4 se quedaban fuera fragmentos útiles
// (p. ej. pasos de procedimientos en notas cortas, que rondan 0.35-0.4).
// 0.3 da mejor recall; el modo estricto del prompt ignora lo irrelevante.
const MATCH_THRESHOLD = 0.3;

// Pedimos más filas de las que devolvemos porque después descartamos los
// fragmentos con texto repetido. Sin este margen, un documento que repite su
// contenido (PDFs con las mismas páginas duplicadas) se comía todas las plazas
// y dejaba fuera al resto de documentos relevantes.
const OVERFETCH = 3;

/**
 * Recupera los fragmentos más relevantes para una consulta (RAG).
 * Genera el embedding de la query y llama a la función SQL `match_chunks`.
 *
 * `scope` restringe la búsqueda a los documentos y notas de ese ámbito, para
 * que cada pestaña del asistente responda solo con su propio material.
 * Omitirlo busca en todos los ámbitos.
 */
export async function retrieveRelevantChunks(
  query: string,
  matchCount = 5,
  scope?: AgentScope,
): Promise<Source[]> {
  const supabase = supabaseServer();
  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: matchCount * OVERFETCH,
    filter_scope: scope ?? null,
  });

  if (error) {
    throw new Error(`Error en match_chunks: ${error.message}`);
  }

  const rows = (data ?? []) as MatchChunkRow[];

  // Las filas vienen de más a menos relevantes: al quedarnos con la primera
  // aparición de cada texto conservamos siempre la copia mejor puntuada.
  const seen = new Set<string>();
  const unique: Source[] = [];
  for (const row of rows) {
    const key = row.content.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      documentId: row.document_id,
      documentName: row.document_name,
      company: row.document_company ?? undefined,
      category: row.document_category ?? undefined,
      content: row.content,
      similarity: row.similarity,
    });
    if (unique.length === matchCount) break;
  }

  return unique;
}
