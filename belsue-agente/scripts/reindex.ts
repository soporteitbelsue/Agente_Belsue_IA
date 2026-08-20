/**
 * Recalcula los embeddings de todo el conocimiento, añadiendo a cada fragmento
 * la identidad de su documento (nombre · compañía · categoría · curso).
 *
 *   npm run reindex              (todo)
 *   npm run reindex -- --id <uuid>
 *
 * POR QUÉ: un condicionado de 427 fragmentos solo nombraba a su compañía en 13
 * de ellos. Los otros 414 eran texto genérico de seguros idéntico al de
 * cualquier aseguradora, así que al preguntar "hogar de Mapfre" ganaba el
 * condicionado de Occident. Con la identidad delante, cada fragmento sabe de
 * quién es.
 *
 * Reutiliza el TEXTO ya guardado de cada fragmento en lugar de volver a leer
 * los archivos: es más rápido, no depende de que el original siga en Storage
 * (hay documentos antiguos que ya no lo están) y no puede estropear el
 * troceado, que no ha cambiado.
 *
 * Se puede cortar y relanzar: cada fragmento se actualiza por su id.
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { buildChunkIdentity, type DocMeta } from "../lib/chunking";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 20;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Doc {
  id: string;
  name: string;
  company: string | null;
  category: string | null;
}

interface Chunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
}

/** Curso y lección, si el documento es material de formación. */
async function metaDeLeccion(documentId: string) {
  const { data } = await supabase
    .from("lessons")
    .select("title, position, courses(title)")
    .eq("document_id", documentId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const l = data as unknown as { courses: { title: string } | null } | null;
  return l?.courses?.title ?? null;
}

async function reindexar(doc: Doc): Promise<number> {
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, content, chunk_index")
    .eq("document_id", doc.id)
    .order("chunk_index", { ascending: true });
  if (error) throw new Error(error.message);

  const fragmentos = (data ?? []) as Chunk[];
  if (fragmentos.length === 0) return 0;

  const meta: DocMeta = { ...doc, courseTitle: await metaDeLeccion(doc.id) };
  const identidad = buildChunkIdentity(meta);
  if (!identidad) return 0;

  for (let i = 0; i < fragmentos.length; i += BATCH_SIZE) {
    const lote = fragmentos.slice(i, i + BATCH_SIZE);
    const registros = await Promise.all(
      lote.map(async (fragmento) => {
        const res = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: `${identidad}\n${fragmento.content}`.replace(/\n/g, " "),
        });
        return { ...fragmento, embedding: res.data[0]!.embedding };
      }),
    );

    const { error: upErr } = await supabase
      .from("document_chunks")
      .upsert(registros, { onConflict: "id" });
    if (upErr) throw new Error(upErr.message);
  }

  return fragmentos.length;
}

async function main() {
  const args = process.argv.slice(2);
  const soloId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;

  let query = supabase
    .from("documents")
    .select("id, name, company, category")
    .order("created_at", { ascending: true });
  if (soloId) query = query.eq("id", soloId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const docs = (data ?? []) as Doc[];
  console.log(`Reindexando ${docs.length} documentos…\n`);

  let ok = 0;
  let fallos = 0;
  let total = 0;
  const inicio = Date.now();

  for (const [i, doc] of docs.entries()) {
    const etiqueta = `[${i + 1}/${docs.length}] ${doc.name.slice(0, 50)}`;
    try {
      const n = await reindexar(doc);
      total += n;
      ok++;
      console.log(`${etiqueta} — ${n}`);
    } catch (err) {
      fallos++;
      console.log(
        `${etiqueta} — FALLO: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Documentos: ${ok} | Fallos: ${fallos}`);
  console.log(`Fragmentos recalculados: ${total} | Tiempo: ${minutos} min`);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
