import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { requireAdmin } from "@/lib/auth";
import { AGENT_SCOPES, parseScope } from "@/lib/scopes";

export const runtime = "nodejs";

interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  scope: string;
  position: number;
  created_at: string;
  lessons: { id: string }[] | null;
}

/**
 * GET /api/courses — cursos del ámbito, con su número de lecciones y cuántas
 * lleva vistas quien consulta. Abierto a cualquier usuario autenticado.
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const scope = parseScope(new URL(req.url).searchParams.get("scope"));

  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("courses")
      .select("id, title, description, scope, position, created_at, lessons(id)")
      .eq("scope", scope)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[courses] Error al listar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as CourseRow[];

    // Lecciones que este usuario ya ha marcado como vistas.
    const lessonIds = rows.flatMap((c) => (c.lessons ?? []).map((l) => l.id));
    const viewed = new Set<string>();
    if (lessonIds.length > 0) {
      const { data: views } = await supabase
        .from("lesson_views")
        .select("lesson_id")
        .eq("user_id", userId)
        .in("lesson_id", lessonIds);
      for (const v of views ?? []) viewed.add(v.lesson_id as string);
    }

    const courses = rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      scope: parseScope(c.scope),
      position: c.position,
      created_at: c.created_at,
      lesson_count: c.lessons?.length ?? 0,
      viewed_count: (c.lessons ?? []).filter((l) => viewed.has(l.id)).length,
    }));

    return NextResponse.json({ courses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1, "El título del curso es obligatorio."),
  description: z.string().trim().optional(),
  scope: z.enum(AGENT_SCOPES).optional().default("procedimientos"),
});

/**
 * POST /api/courses — crea un curso vacío. Solo administración: el temario es
 * material oficial, a diferencia de las notas de conocimiento, que aporta
 * cualquiera.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

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

  // El curso nuevo se coloca al final del listado.
  const { data: last } = await supabase
    .from("courses")
    .select("position")
    .eq("scope", body.scope)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("courses")
    .insert({
      title: body.title,
      description: body.description ?? null,
      scope: body.scope,
      position: (last?.position ?? -1) + 1,
      created_by: userId,
    })
    .select("id, title, description, scope, position, created_at")
    .single();

  if (error || !data) {
    console.error("[courses] Error al crear:", error);
    return NextResponse.json(
      { error: error?.message ?? "No se pudo crear el curso." },
      { status: 500 },
    );
  }

  return NextResponse.json({ course: data }, { status: 201 });
}
