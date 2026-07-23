import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { createSignedDownload } from "@/lib/storage";

export const runtime = "nodejs";

/** true si el file_path es una ruta de Storage (no una ruta de disco antigua). */
function isStoragePath(p: string | null): p is string {
  return !!p && !p.includes("/") && !p.includes("\\");
}

function sanitizeFilename(name: string, ext: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "documento";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

/**
 * GET /api/documents/{id}/download — devuelve un enlace firmado temporal para
 * descargar el documento. Disponible para cualquier usuario autenticado.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("name, file_path, file_type")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  }
  if (doc.file_type === "nota") {
    return NextResponse.json(
      { error: "Las notas no tienen archivo descargable." },
      { status: 400 },
    );
  }
  if (!isStoragePath(doc.file_path)) {
    return NextResponse.json(
      {
        error:
          "El archivo original no está disponible (documento antiguo, solo indexado).",
      },
      { status: 409 },
    );
  }

  try {
    const filename = sanitizeFilename(doc.name, doc.file_type);
    const url = await createSignedDownload(doc.file_path, filename);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
