import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";

export const runtime = "nodejs";

interface Row {
  id: string;
  name: string;
  description: string | null;
  company: string | null;
  category: string | null;
  file_type: string;
  file_size: number;
  file_path: string | null;
  created_at: string;
}

function isStoragePath(p: string | null): boolean {
  return !!p && !p.includes("/") && !p.includes("\\");
}

/**
 * GET /api/documents/browse — lista de documentos (PDF/DOCX/TXT) para cualquier
 * usuario autenticado, con indicador de si se pueden descargar. No expone la
 * ruta interna del archivo.
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    let query = supabase
      .from("documents")
      .select(
        "id, name, description, company, category, file_type, file_size, file_path, created_at",
      )
      .in("file_type", ["pdf", "docx", "txt"])
      .order("created_at", { ascending: false });

    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) {
      console.error("[browse] Error al listar documentos:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const documents = ((data ?? []) as Row[]).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      company: d.company,
      category: d.category,
      file_type: d.file_type,
      file_size: d.file_size,
      created_at: d.created_at,
      downloadable: isStoragePath(d.file_path),
    }));

    return NextResponse.json({ documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
