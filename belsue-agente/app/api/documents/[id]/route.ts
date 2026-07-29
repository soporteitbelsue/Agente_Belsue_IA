import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { removeFile, downloadFile } from "@/lib/storage";
import { processAndStoreBuffer } from "@/lib/embeddings";

export const runtime = "nodejs";
// Editar metadatos reindexa el documento (la cabecera va fusionada con el
// contenido); ampliamos el límite por si el archivo es grande.
export const maxDuration = 300;

/** true si el archivo está en Storage (ruta sin barras). */
function isStoragePath(p: string | null): p is string {
  return !!p && !p.includes("/") && !p.includes("\\");
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    company: z.string().trim().nullable().optional(),
    category: z.string().trim().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "No hay cambios que guardar.",
  });

/**
 * PATCH /api/documents/{id} — edita los metadatos de un documento (nombre,
 * descripción, compañía, categoría) y regenera su fragmento de cabecera para
 * que el cambio se refleje en la búsqueda. Solo admin.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: z.infer<typeof updateSchema>;
  try {
    const json = await req.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const fields: Record<string, unknown> = {};
  if (body.name !== undefined) fields.name = body.name;
  if (body.description !== undefined) fields.description = body.description || null;
  if (body.company !== undefined) fields.company = body.company || null;
  if (body.category !== undefined) fields.category = body.category;

  const { data, error } = await supabase
    .from("documents")
    .update(fields)
    .eq("id", params.id)
    .select("id, file_path, file_type")
    .maybeSingle();

  if (error) {
    console.error("[documents] Error al editar metadatos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  }

  // Reindexa el documento para que la cabecera fusionada (con la nueva
  // descripción) se refleje en la búsqueda. Best-effort: si falla, los
  // metadatos ya se guardaron. Solo posible si el archivo está en Storage.
  if (isStoragePath(data.file_path)) {
    try {
      const buffer = await downloadFile(data.file_path);
      await processAndStoreBuffer(params.id, buffer, data.file_type);
    } catch (err) {
      console.error("[documents] Error al reindexar tras editar:", err);
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/documents/{id}
 * Borra el documento de Supabase (los chunks se eliminan en cascada)
 * y elimina el archivo físico del disco.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();

    // Recupera la ruta del archivo antes de borrar el registro.
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("file_path")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError) {
      console.error("[delete] Error al consultar el documento:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!doc) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }

    // Borra el registro (los document_chunks caen por ON DELETE CASCADE).
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", params.id);

    if (deleteError) {
      console.error("[delete] Error al borrar en Supabase:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Borra el archivo de Storage (best-effort). Las notas no tienen archivo.
    if (doc.file_path) {
      await removeFile(doc.file_path);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete] Error inesperado:", err);
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
