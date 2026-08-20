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

// Fragmentos como mucho por documento. Sin tope, un condicionado de 400
// fragmentos se llevaba la mitad del contexto con trozos casi iguales y
// dejaba fuera a las demás compañías: preguntando qué condicionados de hogar
// había, solo llegaban cuatro documentos de los diecinueve que existen.
const MAX_PER_DOCUMENT = 2;

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

  const toSource = (row: MatchChunkRow): Source => ({
    documentId: row.document_id,
    documentName: row.document_name,
    company: row.document_company ?? undefined,
    category: row.document_category ?? undefined,
    content: row.content,
    similarity: row.similarity,
  });

  // Las filas vienen de más a menos relevantes: al quedarnos con la primera
  // aparición de cada texto conservamos siempre la copia mejor puntuada.
  const seen = new Set<string>();
  const perDocument = new Map<string, number>();
  const chosen: Source[] = [];
  const overflow: MatchChunkRow[] = [];

  for (const row of rows) {
    const key = row.content.trim();
    if (seen.has(key)) continue;
    seen.add(key);

    const used = perDocument.get(row.document_id) ?? 0;
    if (used >= MAX_PER_DOCUMENT) {
      overflow.push(row); // se guarda por si luego falta relleno
      continue;
    }
    perDocument.set(row.document_id, used + 1);
    chosen.push(toSource(row));
    if (chosen.length === matchCount) return chosen;
  }

  // Si el tope ha dejado huecos (pocos documentos hablan del tema), se rellena
  // con lo mejor que se había apartado: más vale repetir documento que ir corto.
  for (const row of overflow) {
    if (chosen.length === matchCount) break;
    chosen.push(toSource(row));
  }

  return chosen;
}
