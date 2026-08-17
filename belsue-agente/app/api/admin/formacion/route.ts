import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

interface CourseRow {
  id: string;
  title: string;
  position: number;
  lessons: { id: string }[] | null;
}

/**
 * GET /api/admin/formacion — quién lleva hecho qué de cada curso.
 *
 * El seguimiento ya se guardaba, pero solo lo veía cada persona en su propia
 * pantalla. Aquí se ve el conjunto, que es para lo que sirve: saber si quien
 * acaba de entrar ha hecho la formación.
 */
export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();

    const [{ data: courseData, error: courseError }, { data: userData }] =
      await Promise.all([
        supabase
          .from("courses")
          .select("id, title, position, lessons(id)")
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("users")
          .select("id, name, department")
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    const courses = ((courseData ?? []) as unknown as CourseRow[]).map((c) => ({
      id: c.id,
      title: c.title,
      lessonIds: (c.lessons ?? []).map((l) => l.id),
    }));

    // Todas las lecciones vistas de una vez: una consulta en lugar de una por
    // persona y curso.
    const { data: views } = await supabase
      .from("lesson_views")
      .select("user_id, lesson_id");

    const viewsByUser = new Map<string, Set<string>>();
    for (const v of views ?? []) {
      const key = v.user_id as string;
      if (!viewsByUser.has(key)) viewsByUser.set(key, new Set());
      viewsByUser.get(key)!.add(v.lesson_id as string);
    }

    const users = (userData ?? []).map((u) => {
      const seen = viewsByUser.get(u.id as string) ?? new Set<string>();
      return {
        id: u.id as string,
        name: u.name as string,
        department: (u.department as string | null) ?? null,
        progress: courses.map((c) => ({
          courseId: c.id,
          done: c.lessonIds.filter((id) => seen.has(id)).length,
          total: c.lessonIds.length,
        })),
      };
    });

    return NextResponse.json({
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        lessons: c.lessonIds.length,
      })),
      users,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
