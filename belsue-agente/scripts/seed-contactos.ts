/**
 * Genera el material indexado de la agenda de contactos: un documento por
 * compañía, con sus fragmentos y embeddings.
 *
 *   npm run seed-contactos
 *   npm run seed-contactos -- --dry
 *
 * CUÁNDO: una sola vez, después de volcar la agenda en la tabla `contacts`.
 * A partir de ahí la aplicación se encarga sola: crear, editar o borrar un
 * contacto reindexa su compañía (ver `lib/contacts.ts`).
 *
 * POR QUÉ UN DOCUMENTO POR COMPAÑÍA: `lib/retrieval.ts` limita a 2 los
 * fragmentos que puede aportar cada documento. Con toda la agenda en un solo
 * documento, el agente solo podría recuperar dos contactos por pregunta.
 *
 * Se puede cortar y relanzar: cada compañía se rehace por completo.
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { chunkText, dropDuplicates, buildMetadataHeader, buildChunkIdentity } from "../lib/chunking";
import {
  CONTACTS_CATEGORY,
  companiaATexto,
  descripcionDocumentoContactos,
  nombreDocumentoContactos,
  type ContactoLegible,
} from "../lib/contactsText";

const EMBEDDING_MODEL = "text-embedding-3-small";
const SCOPE = "procedimientos";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const seco = process.argv.includes("--dry");

async function embedding(texto: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texto,
  });
  const vector = res.data[0]?.embedding;
  if (!vector) throw new Error("La API de embeddings no devolvió vector.");
  return vector;
}

async function main() {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("scope", SCOPE)
    .order("company", { ascending: true })
    .order("department", { ascending: true, nullsFirst: true });

  if (error) throw new Error(`No se pudieron leer los contactos: ${error.message}`);

  const contactos = (data ?? []) as (ContactoLegible & { company: string })[];

  const porCompania = new Map<string, ContactoLegible[]>();
  for (const c of contactos) {
    if (!porCompania.has(c.company)) porCompania.set(c.company, []);
    porCompania.get(c.company)!.push(c);
  }

  console.log(
    `${contactos.length} contactos en ${porCompania.size} compañías.` +
      (seco ? " (simulación: no se escribe nada)" : ""),
  );

  let hechas = 0;
  let fragmentos = 0;

  for (const [company, lista] of porCompania) {
    const texto = companiaATexto(lista);
    const nombre = nombreDocumentoContactos(company);
    const descripcion = descripcionDocumentoContactos(company);

    if (seco) {
      console.log(`· ${company} (${lista.length}) → ${texto.length} caracteres`);
      hechas++;
      continue;
    }

    // 1. Documento de la compañía (se reutiliza si ya existe).
    const { data: previo } = await supabase
      .from("documents")
      .select("id")
      .eq("file_type", "nota")
      .eq("category", CONTACTS_CATEGORY)
      .eq("company", company)
      .eq("scope", SCOPE)
      .maybeSingle();

    let documentId: string;
    const campos = {
      name: nombre,
      description: descripcion,
      content: texto,
      file_size: Buffer.byteLength(texto, "utf8"),
    };

    if (previo) {
      await supabase.from("documents").update(campos).eq("id", previo.id);
      documentId = previo.id as string;
    } else {
      const { data: creado, error: errCrear } = await supabase
        .from("documents")
        .insert({
          ...campos,
          file_path: null,
          file_type: "nota",
          category: CONTACTS_CATEGORY,
          company,
          scope: SCOPE,
          scopes: [SCOPE],
        })
        .select("id")
        .single();
      if (errCrear || !creado) {
        throw new Error(`No se pudo crear el documento de ${company}: ${errCrear?.message}`);
      }
      documentId = creado.id as string;
    }

    // 2. Fragmentos, con la misma cabecera e identidad que usa la aplicación.
    const meta = {
      name: nombre,
      description: descripcion,
      company,
      category: CONTACTS_CATEGORY,
      courseTitle: null,
      lessonTitle: null,
      lessonPosition: null,
    };
    const cabecera = buildMetadataHeader(meta);
    const identidad = buildChunkIdentity(meta);
    const trozos = dropDuplicates(chunkText(cabecera ? `${cabecera}\n\n${texto}` : texto));

    await supabase.from("document_chunks").delete().eq("document_id", documentId);

    const registros = await Promise.all(
      trozos.map(async (content, i) => ({
        document_id: documentId,
        content,
        embedding: await embedding(identidad ? `${identidad}\n${content}` : content),
        chunk_index: i,
      })),
    );

    const { error: errChunks } = await supabase.from("document_chunks").insert(registros);
    if (errChunks) throw new Error(`Fragmentos de ${company}: ${errChunks.message}`);

    hechas++;
    fragmentos += registros.length;
    if (hechas % 20 === 0) console.log(`  ${hechas}/${porCompania.size} compañías…`);
  }

  console.log(`Listo: ${hechas} compañías, ${fragmentos} fragmentos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
