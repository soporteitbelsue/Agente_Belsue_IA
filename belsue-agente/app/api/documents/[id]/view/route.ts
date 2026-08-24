import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { createSignedView } from "@/lib/storage";
import { parseVideoUrl } from "@/lib/video";

export const runtime = "nodejs";

/** Tipos que el navegador sabe mostrar por sí solo, sin descargar. */
const VIEWABLE = new Set(["pdf", "txt"]);


/** true si el file_path es una ruta de Storage (no una ruta de disco antigua). */
function isStoragePath(p: string | null): p is string {
  return !!p && !p.includes("/") && !p.includes("\\");
}

/**
 * GET /api/documents/{id}/view — enlace firmado para ver el documento dentro de
 * la página (lecciones de los cursos). Solo para los tipos que el navegador
 * renderiza; el resto hay que descargarlos.
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
  // Un vídeo se reproduce desde su plataforma: no hay archivo que firmar.
  if (doc.file_type === "video") {
    const video = parseVideoUrl(doc.file_path ?? "");
    if (!video) {
      return NextResponse.json(
        { error: "El enlace del vídeo no es válido." },
        { status: 409 },
      );
    }
    return NextResponse.json({ url: video.embedUrl, video: true });
  }

  if (!VIEWABLE.has(doc.file_type)) {
    return NextResponse.json(
      {
        error:
          "Este material no se puede ver dentro de la página; hay que descargarlo.",
      },
      { status: 415 },
    );
  }
  if (!isStoragePath(doc.file_path)) {
    return NextResponse.json(
      { error: "El archivo original no está disponible." },
      { status: 409 },
    );
  }

  try {
    const url = await createSignedView(doc.file_path);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
