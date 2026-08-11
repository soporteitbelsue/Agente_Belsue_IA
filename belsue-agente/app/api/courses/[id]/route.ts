import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { requireAdmin } from "@/lib/auth";
import { parseScope } from "@/lib/scopes";
import type { FileType } from "@/types";

export const runtime = "nodejs";

interface LessonRow {
  id: string;
  course_id: string;
  document_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
  documents: { file_type: string; file_size: number; file_path: string | null } | null;
}

/** true si el archivo está en Storage (ruta sin barras), o sea descargable. */
function isStoragePath(p: string | null): boolean {
  return !!p && !p.includes("/") && !p.includes("\\");
}

/** GET /api/courses/{id} — el curso con sus lecciones en orden. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();

    const { data: course, error } = await supabase
      .from("courses")
      .select("id, title, description, scope, position, created_at")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!course) {
      return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
    }

    const { data: lessonRows, error: lessonError } = await supabase
      .from("lessons")
      .select(
        "id, course_id, document_id, title, description, position, created_at, documents(file_type, file_size, file_path)",
      )
      .eq("course_id", params.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (lessonError) {
      return NextResponse.json({ error: lessonError.message }, { status: 500 });
    }

    const rows = (lessonRows ?? []) as unknown as LessonRow[];

    const { data: views } = await supabase
      .from("lesson_views")
      .select("lesson_id")
      .eq("user_id", userId)
      .in("lesson_id", rows.length ? rows.map((l) => l.id) : ["-"]);
    const viewed = new Set((views ?? []).map((v) => v.lesson_id as string));

    const lessons = rows.map((l) => ({
      id: l.id,
      course_id: l.course_id,
      document_id: l.document_id,
      title: l.title,
      description: l.description,
      position: l.position,
      created_at: l.created_at,
      file_type: (l.documents?.file_type ?? "pdf") as FileType,
      file_size: l.documents?.file_size ?? 0,
      downloadable: isStoragePath(l.documents?.file_path ?? null),
      viewed: viewed.has(l.id),
    }));

    return NextResponse.json({
      course: { ...course, scope: parseScope(course.scope), lessons },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const updateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "No hay cambios que guardar.",
  });

/** PATCH /api/courses/{id} — renombra o redescribe el curso. Solo admin. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: z.infer<typeof updateSchema>;
  try {
    const parsed = updateSchema.safeParse(await req.json());
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
  const fields: Record<string, unknown> = {};
  if (body.title !== undefined) fields.title = body.title;
  if (body.description !== undefined) {
    fields.description = body.description || null;
  }

  const { data, error } = await supabase
    .from("courses")
    .update(fields)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/courses/{id} — borra el curso y sus lecciones. Los documentos NO
 * se borran: siguen disponibles en el portal, solo dejan de estar organizados
 * como curso. Solo admin.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const supabase = supabaseServer();
  const { error } = await supabase.from("courses").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
