import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

interface DocumentRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  company: string | null;
  file_type: string;
  file_size: number;
  created_at: string;
  document_chunks: { count: number }[] | null;
}

/**
 * GET /api/documents — lista los documentos ordenados por fecha desc.
 * Query params opcionales:
 *   - category: filtra por categoría exacta
 *   - company: filtra por compañía (parcial, case-insensitive)
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const company = searchParams.get("company");

    let query = supabase
      .from("documents")
      .select(
        "id, name, description, category, company, file_type, file_size, created_at, document_chunks(count)",
      )
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }
    if (company) {
      query = query.ilike("company", `%${company}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[documents] Error al listar documentos:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const documents = ((data ?? []) as DocumentRow[]).map((doc) => ({
      id: doc.id,
      name: doc.name,
      description: doc.description,
      category: doc.category,
      company: doc.company,
      file_type: doc.file_type,
      file_size: doc.file_size,
      created_at: doc.created_at,
      chunk_count: doc.document_chunks?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ documents });
  } catch (err) {
    console.error("[documents] Error inesperado:", err);
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
