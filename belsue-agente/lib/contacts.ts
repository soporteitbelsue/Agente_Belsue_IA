import { supabaseServer } from "@/lib/supabase";
import { processAndStoreText } from "@/lib/embeddings";
import {
  CONTACTS_CATEGORY,
  companiaATexto,
  descripcionDocumentoContactos,
  nombreDocumentoContactos,
} from "@/lib/contactsText";
import type { AgentScope } from "@/lib/scopes";
import type { Contact } from "@/types";

export { CONTACTS_CATEGORY };

/**
 * Regenera el material indexado de UNA compañía: reescribe su texto, lo
 * trocea y lo vuelve a embeber. Se llama después de crear, editar o borrar
 * un contacto, para que el agente nunca responda con el dato viejo.
 *
 * Va por compañía y no en un único documento con toda la agenda porque
 * `retrieval.ts` limita a 2 los fragmentos que aporta cada documento: con la
 * agenda entera junta, el agente solo podría recuperar dos contactos por
 * pregunta. Separada por compañía, cada una compite por su cuenta.
 */
export async function reindexarCompania(
  company: string,
  scope: AgentScope,
): Promise<void> {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("company", company)
    .eq("scope", scope)
    .order("department", { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`No se pudieron leer los contactos: ${error.message}`);
  }

  const contactos = (data ?? []) as Contact[];

  const { data: previo } = await supabase
    .from("documents")
    .select("id")
    .eq("file_type", "nota")
    .eq("category", CONTACTS_CATEGORY)
    .eq("company", company)
    .eq("scope", scope)
    .maybeSingle();

  // Sin contactos ya no hay nada que indexar: se retira el documento (sus
  // fragmentos caen en cascada) en vez de dejarlo con texto obsoleto.
  if (contactos.length === 0) {
    if (previo) await supabase.from("documents").delete().eq("id", previo.id);
    return;
  }

  const texto = companiaATexto(contactos);
  const nombre = nombreDocumentoContactos(company);
  const descripcion = descripcionDocumentoContactos(company);
  const tamanio = Buffer.byteLength(texto, "utf8");

  let documentId = previo?.id as string | undefined;

  if (documentId) {
    await supabase
      .from("documents")
      .update({
        name: nombre,
        description: descripcion,
        content: texto,
        file_size: tamanio,
      })
      .eq("id", documentId);
  } else {
    const { data: creado, error: errCrear } = await supabase
      .from("documents")
      .insert({
        name: nombre,
        description: descripcion,
        file_path: null,
        file_type: "nota",
        file_size: tamanio,
        category: CONTACTS_CATEGORY,
        company,
        scope,
        scopes: [scope],
        content: texto,
      })
      .select("id")
      .single();

    if (errCrear || !creado) {
      throw new Error(
        errCrear?.message ?? "No se pudo crear el documento de contactos.",
      );
    }
    documentId = creado.id as string;
  }

  await processAndStoreText(documentId, texto);
}

/**
 * Reindexa varias compañías, en serie. En serie y no en paralelo porque cada
 * una consume la API de embeddings y no merece la pena arriesgar un rate
 * limit por acelerar una operación que el usuario ya no está esperando.
 */
export async function reindexarCompanias(
  companias: string[],
  scope: AgentScope,
): Promise<void> {
  for (const c of [...new Set(companias)]) {
    await reindexarCompania(c, scope);
  }
}
