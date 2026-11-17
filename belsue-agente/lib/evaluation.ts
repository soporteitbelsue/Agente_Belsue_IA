import { supabaseServer } from "@/lib/supabase";
import { openai, CHAT_MODEL } from "@/lib/openai";
import {
  retrieveRelevantChunks,
  SEARCH_MODES,
  type SearchMode,
} from "@/lib/retrieval";
import type { Source } from "@/types";

/**
 * Evaluación de la búsqueda.
 *
 * Para saber si un cambio hace al agente más listo hay que medirlo, no
 * intuirlo. Casi siempre que responde mal es porque el fragmento bueno no le
 * llegó, así que se mide eso: para cada pregunta de la batería se sabe qué
 * documento la responde, y se comprueba si sale entre los que recibe el agente.
 *
 * Las preguntas se generan a partir de fragmentos reales: el modelo lee un
 * trozo y escribe la pregunta que haría alguien del equipo para encontrarlo.
 */

/** Fragmentos que recibe el agente en el chat (debe coincidir con la ruta). */
const CHAT_MATCH_COUNT = 8;
/** Preguntas evaluadas a la vez (cada una puede llamar al modelo). */
const CONCURRENCY = 4;
/** Fragmentos demasiado cortos no dan para una pregunta con sentido. */
const MIN_CHUNK_LENGTH = 300;

interface EvalQuestion {
  id: string;
  question: string;
  expected_document_id: string;
  origen: string;
  documents: { name: string } | null;
  /** Fragmento con el que se escribió la pregunta. */
  document_chunks: { content: string } | null;
}

export interface ModeSummary {
  mode: SearchMode;
  /** % de preguntas cuyo documento sale entre los que recibe el agente. */
  aciertos: number;
  /** Media de 1/posición del documento correcto (1 = siempre el primero). */
  mrr: number;
  /** Tiempo medio de búsqueda, en milisegundos. */
  msMedio: number;
}

export interface QuestionResult {
  question: string;
  esperado: string;
  origen: string;
  /** Posición (1 = primero) del documento correcto en cada modo; null = no sale. */
  posiciones: Record<SearchMode, number | null>;
  /** Documentos que recibió el agente con el modo más completo. */
  obtenidos: string[];
}

export interface EvalReport {
  preguntas: number;
  resumen: ModeSummary[];
  resultados: QuestionResult[];
}

/** Ejecuta `fn` sobre cada elemento, con `limit` a la vez, conservando el orden. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Batería actual, con el nombre del documento esperado. */
export async function listQuestions(): Promise<EvalQuestion[]> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("eval_questions")
    .select(
      "id, question, expected_document_id, origen, documents(name), document_chunks(content)",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EvalQuestion[];
}

/** Minúsculas, espacios simples: para comparar nombres y textos. */
function flat(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Trozo del fragmento de origen que, si aparece, delata que llegó el dato. */
const PROBE_LENGTH = 160;

/**
 * Posición (1 = primero) del primer documento recibido que contiene la
 * respuesta, o null si no llega ninguno.
 *
 * No basta con mirar el id del documento: la base tiene documentos subidos dos
 * veces con el mismo nombre, y productos hermanos (moto, robo, pérdida total)
 * con cláusulas idénticas. Si el agente recibe cualquiera de ellos, tiene el
 * dato. Así que vale el mismo id, el mismo nombre o el mismo texto: un trozo
 * del centro del fragmento con el que se escribió la pregunta.
 */
function answerPosition(q: EvalQuestion, sources: Source[]): number | null {
  const expectedName = q.documents?.name ? flat(q.documents.name) : null;
  const origin = q.document_chunks?.content ? flat(q.document_chunks.content) : "";
  const start = Math.max(0, Math.floor((origin.length - PROBE_LENGTH) / 2));
  const probe = origin.length >= PROBE_LENGTH ? origin.slice(start, start + PROBE_LENGTH) : origin;

  const order: string[] = [];
  const hit = new Set<string>();
  for (const s of sources) {
    const key = s.documentId ?? s.documentName;
    if (!order.includes(key)) order.push(key);
    if (
      s.documentId === q.expected_document_id ||
      (expectedName !== null && flat(s.documentName) === expectedName) ||
      (probe.length > 0 && flat(s.content).includes(probe))
    ) {
      hit.add(key);
    }
  }
  const index = order.findIndex((key) => hit.has(key));
  return index === -1 ? null : index + 1;
}

/** Pasa la batería por los tres modos de búsqueda. */
export async function runEvaluation(): Promise<EvalReport> {
  const questions = await listQuestions();

  const perQuestion = await mapLimit(questions, CONCURRENCY, async (q) => {
    const posiciones = {} as Record<SearchMode, number | null>;
    const tiempos = {} as Record<SearchMode, number>;
    let obtenidos: string[] = [];

    for (const mode of SEARCH_MODES) {
      const start = Date.now();
      let pos: number | null = null;
      try {
        const sources = await retrieveRelevantChunks(
          q.question,
          CHAT_MATCH_COUNT,
          undefined,
          mode,
        );
        pos = answerPosition(q, sources);
        if (mode === "rerank") {
          obtenidos = [...new Set(sources.map((s) => s.documentName))];
        }
      } catch (err) {
        console.error(`[eval] Falló la búsqueda (${mode}):`, err);
      }
      tiempos[mode] = Date.now() - start;
      posiciones[mode] = pos;
    }

    return {
      result: {
        question: q.question,
        esperado: q.documents?.name ?? q.expected_document_id,
        origen: q.origen,
        posiciones,
        obtenidos,
      } satisfies QuestionResult,
      tiempos,
    };
  });

  const n = perQuestion.length || 1;
  const resumen: ModeSummary[] = SEARCH_MODES.map((mode) => {
    const hits = perQuestion.filter((p) => p.result.posiciones[mode] !== null);
    const mrr =
      perQuestion.reduce((acc, p) => {
        const pos = p.result.posiciones[mode];
        return acc + (pos ? 1 / pos : 0);
      }, 0) / n;
    const ms = perQuestion.reduce((acc, p) => acc + p.tiempos[mode], 0) / n;
    return {
      mode,
      aciertos: Math.round((hits.length / n) * 1000) / 10,
      mrr: Math.round(mrr * 100) / 100,
      msMedio: Math.round(ms),
    };
  });

  return {
    preguntas: perQuestion.length,
    resumen,
    resultados: perQuestion.map((p) => p.result),
  };
}

const QUESTION_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "pregunta_de_prueba",
    strict: true,
    schema: {
      type: "object",
      properties: {
        valida: {
          type: "boolean",
          description:
            "false si el fragmento no tiene información útil (índice, portada, texto legal genérico, tabla vacía).",
        },
        pregunta: { type: "string" },
      },
      required: ["valida", "pregunta"],
      additionalProperties: false,
    },
  },
};

const QUESTION_PROMPT = `Te paso un fragmento de un documento interno de una correduría de seguros (un condicionado, una nota, un procedimiento o una lección de un curso), con el nombre del documento y su compañía o área.

Escribe UNA pregunta que haría un empleado de la correduría en el chat interno y que este fragmento responde. Escríbela como la escribiría de verdad: natural, corta, en español, sin copiar frases literales del fragmento y sin citar el título del documento.

Si el documento es de una compañía, la pregunta DEBE nombrar la compañía y el producto o ramo (por ejemplo "¿la franquicia del hogar de Mapfre?", "¿qué cubre el auto de Allianz si...?"). Muchas cláusulas (Consorcio, reclamaciones, plazos para comunicar un siniestro) son casi iguales en todos los condicionados: sin compañía ni producto, la pregunta no tendría una respuesta única. Si es una nota, un procedimiento o una lección interna, no hace falta compañía.

Si el fragmento no tiene información útil para nadie (un índice, una portada, texto legal genérico, una tabla sin datos), marca valida = false.`;

/**
 * Añade preguntas sintéticas a la batería: elige documentos al azar (los que
 * menos preguntas tienen primero, para cubrir bien el catálogo), un fragmento
 * al azar de cada uno, y le pide al modelo la pregunta.
 */
export async function generateQuestions(count: number): Promise<number> {
  const supabase = supabaseServer();

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, name, company");
  if (error) throw new Error(error.message);
  if (!docs?.length) return 0;

  const existing = await listQuestions();
  const perDoc = new Map<string, number>();
  for (const q of existing) {
    perDoc.set(q.expected_document_id, (perDoc.get(q.expected_document_id) ?? 0) + 1);
  }

  // Barajar y después ordenar por cuántas preguntas tiene ya cada uno.
  const shuffled = docs
    .map((d) => ({ d, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ d }) => d)
    .sort((a, b) => (perDoc.get(a.id) ?? 0) - (perDoc.get(b.id) ?? 0));

  // Se piden algunos de más: unos fragmentos salen no válidos.
  const candidates = shuffled.slice(0, Math.ceil(count * 1.4));

  const created = await mapLimit(candidates, CONCURRENCY, async (doc) => {
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("id, content")
      .eq("document_id", doc.id)
      .limit(300);
    const usable = (chunks ?? []).filter(
      (c) => c.content.trim().length >= MIN_CHUNK_LENGTH,
    );
    const chunk = usable[Math.floor(Math.random() * usable.length)];
    if (!chunk) return null;

    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        response_format: QUESTION_FORMAT,
        messages: [
          { role: "system", content: QUESTION_PROMPT },
          {
            role: "user",
            content: `Documento: ${doc.name}${doc.company ? ` (${doc.company})` : ""}\n\nFragmento:\n${chunk.content.slice(0, 2500)}`,
          },
        ],
      });
      const parsed = JSON.parse(
        completion.choices[0]?.message?.content ?? "{}",
      ) as { valida?: boolean; pregunta?: string };
      if (!parsed.valida || !parsed.pregunta?.trim()) return null;
      return {
        question: parsed.pregunta.trim(),
        expected_document_id: doc.id,
        source_chunk_id: chunk.id,
        origen: "sintetica",
      };
    } catch (err) {
      console.error("[eval] No se pudo generar una pregunta:", err);
      return null;
    }
  });

  const rows = created.filter((r) => r !== null).slice(0, count);
  if (rows.length === 0) return 0;

  const { error: insertError } = await supabase.from("eval_questions").insert(rows);
  if (insertError) throw new Error(insertError.message);
  return rows.length;
}

/** Vacía la batería (para empezar otra desde cero). */
export async function clearQuestions(): Promise<void> {
  const supabase = supabaseServer();
  const { error } = await supabase
    .from("eval_questions")
    .delete()
    .not("id", "is", null);
  if (error) throw new Error(error.message);
}
