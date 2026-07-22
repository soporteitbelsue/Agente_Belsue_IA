import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { processAndStoreBuffer } from "@/lib/embeddings";
import { downloadFile, removeFile } from "@/lib/storage";

export const runtime = "nodejs";
// Indexar PDFs grandes puede tardar; ampliamos el límite (Vercel Pro).
export const maxDuration = 300;

/**
 * POST /api/documents/{id}/process — descarga el archivo de Storage, extrae su
 * texto, genera los embeddings y los guarda. Se llama tras subir el archivo.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const supabase = supabaseServer();

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, file_path, file_type")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!doc || !doc.file_path) {
    return NextResponse.json(
      { error: "Documento no encontrado o sin archivo." },
      { status: 404 },
    );
  }

  try {
    const buffer = await downloadFile(doc.file_path);
    await processAndStoreBuffer(doc.id, buffer, doc.file_type);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[process] Error al indexar ${params.id}:`, err);
    // Limpieza: borrar la fila y el archivo para no dejar un documento roto.
    await removeFile(doc.file_path);
    await supabase.from("documents").delete().eq("id", params.id);
    const message = err instanceof Error ? err.message : "Error al indexar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
