import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/documents/{id}/status
 * Indica si los chunks del documento ya están listos.
 * Respuesta: { status: 'processing' | 'ready', chunkCount: number }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();

    // Comprueba que el documento existe.
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();

    if (docError) {
      console.error("[status] Error al consultar el documento:", docError);
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }
    if (!doc) {
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    }

    const { count, error: countError } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", params.id);

    if (countError) {
      console.error("[status] Error al contar chunks:", countError);
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const chunkCount = count ?? 0;

    return NextResponse.json({
      status: chunkCount > 0 ? "ready" : "processing",
      chunkCount,
    });
  } catch (err) {
    console.error("[status] Error inesperado:", err);
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
