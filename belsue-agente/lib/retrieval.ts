import { supabaseServer } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import { openai, CHAT_MODEL } from "@/lib/openai";
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

/** Candidatos que se le pasan al modelo para que elija los buenos. */
const RERANK_POOL = 30;
/**
 * Tope por documento entre los candidatos a reordenar. Más alto que el normal:
 * si la pregunta es sobre un condicionado concreto, conviene que el modelo vea
 * varios trozos suyos, y de la variedad ya se encarga él al elegir.
 */
const RERANK_MAX_PER_DOCUMENT = 5;
/** Texto de cada candidato que ve el modelo al reordenar. */
const RERANK_SNIPPET = 900;
/** Si reordenar tarda más que esto, se usa el orden de la búsqueda. */
const RERANK_TIMEOUT_MS = 8000;

/**
 * Cómo se busca:
 *  - "vector":  solo por parecido de significado (el método original).
 *  - "hybrid":  significado + palabras exactas, fusionados en la BBDD.
 *  - "rerank":  híbrido, y el modelo elige entre los candidatos los que de
 *               verdad responden a la pregunta.
 */
export type SearchMode = "vector" | "hybrid" | "rerank";

export const SEARCH_MODES: SearchMode[] = ["vector", "hybrid", "rerank"];

/** Modo del chat. Se puede cambiar con SEARCH_MODE sin tocar el código. */
export const DEFAULT_SEARCH_MODE: SearchMode = SEARCH_MODES.includes(
  process.env.SEARCH_MODE as SearchMode,
)
  ? (process.env.SEARCH_MODE as SearchMode)
  : "rerank";

function toSource(row: MatchChunkRow): Source {
  return {
    documentId: row.document_id,
    documentName: row.document_name,
    company: row.document_company ?? undefined,
    category: row.document_category ?? undefined,
    content: row.content,
    similarity: row.similarity,
    page: row.page ?? undefined,
  };
}

/** Filas candidatas, de más a menos relevantes, según el modo. */
async function fetchCandidates(
  query: string,
  embedding: number[],
  count: number,
  mode: SearchMode,
  scope?: AgentScope,
): Promise<MatchChunkRow[]> {
  const supabase = supabaseServer();

  if (mode !== "vector") {
    const { data, error } = await supabase.rpc("match_chunks_hybrid", {
      query_embedding: embedding,
      query_text: query,
      match_threshold: MATCH_THRESHOLD,
      match_count: count,
      filter_scope: scope ?? null,
    });
    if (!error) return (data ?? []) as MatchChunkRow[];
    // Sin la migración 016 aplicada, la función no existe: se sigue con la
    // búsqueda de siempre en vez de dejar al chat sin respuesta.
    console.error("[retrieval] Búsqueda híbrida no disponible:", error.message);
  }

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: count,
    filter_scope: scope ?? null,
  });
  if (error) throw new Error(`Error en match_chunks: ${error.message}`);
  return (data ?? []) as MatchChunkRow[];
}

/**
 * Quita textos repetidos y limita los fragmentos por documento. Las filas
 * vienen de más a menos relevantes: al quedarnos con la primera aparición de
 * cada texto conservamos siempre la copia mejor puntuada.
 */
function diversify(
  rows: MatchChunkRow[],
  limit: number,
  maxPerDocument = MAX_PER_DOCUMENT,
): MatchChunkRow[] {
  const seen = new Set<string>();
  const perDocument = new Map<string, number>();
  const chosen: MatchChunkRow[] = [];
  const overflow: MatchChunkRow[] = [];

  for (const row of rows) {
    const key = row.content.trim();
    if (seen.has(key)) continue;
    seen.add(key);

    const used = perDocument.get(row.document_id) ?? 0;
    if (used >= maxPerDocument) {
      overflow.push(row); // se guarda por si luego falta relleno
      continue;
    }
    perDocument.set(row.document_id, used + 1);
    chosen.push(row);
    if (chosen.length === limit) return chosen;
  }

  // Si el tope ha dejado huecos (pocos documentos hablan del tema), se rellena
  // con lo mejor que se había apartado: más vale repetir documento que ir corto.
  for (const row of overflow) {
    if (chosen.length === limit) break;
    chosen.push(row);
  }
  return chosen;
}

const RERANK_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "fragmentos_relevantes",
    strict: true,
    schema: {
      type: "object",
      properties: {
        relevantes: {
          type: "array",
          description:
            "Números de los fragmentos útiles para responder, del más al menos útil.",
          items: { type: "integer" },
        },
      },
      required: ["relevantes"],
      additionalProperties: false,
    },
  },
};

const RERANK_PROMPT = `Eres el buscador interno de una correduría de seguros. Te paso la consulta de un empleado y una lista numerada de fragmentos de documentos internos (condicionados, notas, procedimientos, cursos).

Devuelve los números de los fragmentos que sirven para responder a la consulta, ordenados del más útil al menos útil. Ten en cuenta la compañía, el ramo y el producto por los que se pregunta: un fragmento de otra compañía u otro ramo no sirve aunque hable de lo mismo, salvo que la consulta pida comparar. No incluyas los que no aporten nada. Si ninguno sirve, devuelve la lista vacía.`;

/**
 * Pide al modelo que elija y ordene los candidatos. Devuelve las filas en el
 * nuevo orden, o null si no ha podido (error o demasiado lento): entonces se
 * usa el orden de la búsqueda.
 */
async function rerank(
  query: string,
  rows: MatchChunkRow[],
): Promise<MatchChunkRow[] | null> {
  if (rows.length <= 1) return rows;

  const list = rows
    .map((r, i) => {
      const meta = [r.document_name, r.document_company, r.document_category]
        .filter(Boolean)
        .join(" · ");
      const text = r.content.replace(/\s+/g, " ").trim().slice(0, RERANK_SNIPPET);
      return `[${i + 1}] (${meta})\n${text}`;
    })
    .join("\n\n");

  try {
    const completion = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        response_format: RERANK_FORMAT,
        messages: [
          { role: "system", content: RERANK_PROMPT },
          {
            role: "user",
            content: `Consulta:\n${query}\n\nFragmentos:\n${list}`,
          },
        ],
      },
      { timeout: RERANK_TIMEOUT_MS, maxRetries: 0 },
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    const { relevantes } = JSON.parse(raw) as { relevantes: number[] };

    const used = new Set<number>();
    const ordered: MatchChunkRow[] = [];
    for (const n of relevantes) {
      const i = n - 1;
      const row = rows[i];
      if (!row || used.has(i)) continue;
      used.add(i);
      ordered.push(row);
    }
    return ordered;
  } catch (err) {
    console.error(
      "[retrieval] No se pudo reordenar; se usa el orden de la búsqueda:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Recupera los fragmentos más relevantes para una consulta (RAG).
 *
 * `scope` restringe la búsqueda a los documentos y notas de ese ámbito.
 * Omitirlo busca en todos (es lo que hace el chat, común a los dos portales).
 */
export async function retrieveRelevantChunks(
  query: string,
  matchCount = 5,
  scope?: AgentScope,
  mode: SearchMode = DEFAULT_SEARCH_MODE,
): Promise<Source[]> {
  const embedding = await generateEmbedding(query);

  if (mode !== "rerank") {
    const rows = await fetchCandidates(
      query,
      embedding,
      matchCount * OVERFETCH,
      mode,
      scope,
    );
    return diversify(rows, matchCount).map(toSource);
  }

  // Con reordenación: se le da al modelo un abanico amplio y ya diverso (sin
  // textos repetidos y con varios documentos), y se queda con los buenos.
  const rows = await fetchCandidates(
    query,
    embedding,
    RERANK_POOL * OVERFETCH,
    "hybrid",
    scope,
  );
  const pool = diversify(rows, RERANK_POOL, RERANK_MAX_PER_DOCUMENT);
  const ordered = await rerank(query, pool);

  // El modelo puede descartarlos todos ("ninguno sirve"). Es una señal útil,
  // pero mandar el contexto vacío hace que el agente ni lo intente; se dejan
  // los primeros de la búsqueda y el prompt ya obliga a no usar lo irrelevante.
  const chosen = ordered && ordered.length > 0 ? ordered : pool;
  return chosen.slice(0, matchCount).map(toSource);
}
