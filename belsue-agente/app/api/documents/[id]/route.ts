import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { removeFile } from "@/lib/storage";

export const runtime = "nodejs";

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
