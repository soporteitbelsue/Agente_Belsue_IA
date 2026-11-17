import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { downloadFile } from "@/lib/storage";
import { processAndStoreBuffer } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reindex/{id} — vuelve a leer un documento con el lector
 * actual (páginas, tablas y escaneados) y sustituye sus fragmentos.
 *
 * A diferencia de la subida, si algo falla NO borra el documento: se queda
 * como estaba, con sus fragmentos anteriores.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = supabaseServer();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, name, file_path, file_type")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!doc?.file_path) {
    return NextResponse.json({ error: "Documento sin archivo." }, { status: 404 });
  }

  const start = Date.now();
  try {
    const buffer = await downloadFile(doc.file_path);
    const stats = await processAndStoreBuffer(doc.id, buffer, doc.file_type);
    return NextResponse.json({ ...stats, segundos: Math.round((Date.now() - start) / 1000) });
  } catch (err) {
    console.error(`[reindex] ${doc.name}:`, err);
    const message = err instanceof Error ? err.message : "Error al releer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
