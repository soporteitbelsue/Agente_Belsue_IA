import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** true si el file_path es una ruta de Storage (no una ruta de disco antigua). */
function isStoragePath(p: string | null): p is string {
  return !!p && !p.includes("/") && !p.includes("\\");
}

/**
 * GET /api/admin/reindex — PDF que todavía no se han leído con el lector
 * nuevo. Se reconocen porque sus fragmentos no tienen página: el lector nuevo
 * siempre la guarda.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = supabaseServer();
  const { data: pdfs, error } = await supabase
    .from("documents")
    .select("id, name, file_path")
    .eq("file_type", "pdf")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // El primer fragmento de cada documento basta para saber si ya tiene página.
  const { data: read, error: readError } = await supabase
    .from("document_chunks")
    .select("document_id")
    .eq("chunk_index", 0)
    .not("page", "is", null);
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  const done = new Set((read ?? []).map((r) => r.document_id as string));

  // Sin el archivo original en Storage no hay nada que releer.
  const withFile = (pdfs ?? []).filter((d) => isStoragePath(d.file_path));

  return NextResponse.json({
    total: withFile.length,
    sinArchivo: (pdfs ?? []).length - withFile.length,
    pendientes: withFile
      .filter((d) => !done.has(d.id))
      .map((d) => ({ id: d.id, name: d.name })),
  });
}
