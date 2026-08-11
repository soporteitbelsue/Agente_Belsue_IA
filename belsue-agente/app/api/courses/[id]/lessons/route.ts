import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";

export const runtime = "nodejs";

const createSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().trim().min(1, "El título de la lección es obligatorio."),
  description: z.string().trim().optional(),
});

/**
 * POST /api/courses/{id}/lessons — añade una lección al curso a partir de un
 * documento ya registrado.
 *
 * Se llama ANTES de indexar el documento (`/api/documents/{id}/process`): así
 * la cabecera que se indexa ya nombra el curso y la lección, y no hay que
 * volver a generar los embeddings.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    const parsed = createSchema.safeParse(await req.json());
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

  const supabase = supabaseServer();

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }

  // La lección nueva va al final del curso.
  const { data: last } = await supabase
    .from("lessons")
    .select("position")
    .eq("course_id", params.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      course_id: params.id,
      document_id: body.documentId,
      title: body.title,
      description: body.description ?? null,
      position: (last?.position ?? -1) + 1,
    })
    .select("id, position")
    .single();

  if (error || !data) {
    console.error("[lessons] Error al crear:", error);
    const duplicate = error?.code === "23505";
    return NextResponse.json(
      {
        error: duplicate
          ? "Ese material ya es una lección de este curso."
          : (error?.message ?? "No se pudo crear la lección."),
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ lesson: data }, { status: 201 });
}
