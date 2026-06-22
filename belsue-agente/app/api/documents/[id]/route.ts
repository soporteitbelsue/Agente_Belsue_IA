import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * DELETE /api/documents/{id}
 * Borra el documento de Supabase (los chunks se eliminan en cascada)
 * y elimina el archivo físico del disco.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = requireAdmin(req);
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

    // Borra el archivo del disco (best-effort).
    if (doc.file_path) {
      await unlink(doc.file_path).catch((err) =>
        console.error("[delete] No se pudo borrar el archivo del disco:", err),
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete] Error inesperado:", err);
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
