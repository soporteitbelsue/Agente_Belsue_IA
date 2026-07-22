import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { getSessionUserId } from "@/lib/conversations";
import { createSignedUpload } from "@/lib/storage";

export const runtime = "nodejs";

const EXT_TO_TYPE: Record<string, string> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
};

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const bodySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  ext: z.string().trim().toLowerCase(),
  fileSize: z.number().int().positive().max(MAX_SIZE, "El archivo supera 20 MB."),
  description: z.string().trim().optional(),
  company: z.string().trim().optional(),
  category: z.string().trim().optional(),
});

/**
 * POST /api/documents/upload-url — registra el documento (aún sin indexar) y
 * devuelve una URL firmada para que el navegador suba el archivo directamente a
 * Supabase Storage. Después se llama a /api/documents/{id}/process.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  const userId = await getSessionUserId();

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const fileType = EXT_TO_TYPE[body.ext];
  if (!fileType) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido. Solo PDF, DOCX o TXT." },
      { status: 400 },
    );
  }

  const supabase = supabaseServer();

  // 1. Registrar el documento (todavía sin chunks; file_path se fija abajo).
  const { data, error } = await supabase
    .from("documents")
    .insert({
      name: body.name,
      description: body.description ?? null,
      file_path: "", // se completa con la ruta de Storage
      file_type: fileType,
      file_size: body.fileSize,
      category: body.category ?? null,
      company: body.company ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[upload-url] Error al registrar el documento:", error);
    return NextResponse.json(
      { error: error?.message ?? "No se pudo registrar el documento." },
      { status: 500 },
    );
  }

  const documentId = data.id as string;
  const storagePath = `${documentId}${body.ext}`;

  // 2. Guardar la ruta de Storage y crear la URL firmada de subida.
  try {
    await supabase
      .from("documents")
      .update({ file_path: storagePath })
      .eq("id", documentId);

    const { path, token } = await createSignedUpload(storagePath);
    return NextResponse.json({ documentId, path, token }, { status: 201 });
  } catch (err) {
    // Si falla, limpiar la fila huérfana.
    await supabase.from("documents").delete().eq("id", documentId);
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
