"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { CourseSummary } from "@/types";

const SCOPE = "procedimientos";

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all ${
            complete ? "bg-green-500" : "bg-belsue"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        {total === 0
          ? "Sin lecciones todavía"
          : complete
            ? "✓ Completado"
            : `${done} de ${total} lecciones vistas`}
      </p>
    </div>
  );
}

/**
 * Catálogo de cursos para el equipo. Crear y publicar se hace en
 * Administración → Cursos: aquí solo se consultan y se siguen.
 */
export default function CursosPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses?scope=${SCOPE}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar los cursos.");
      setCourses(data.courses as CourseSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/procedimientos"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
          >
            ← Volver a Procedimientos internos
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">Cursos</h1>
          <p className="text-sm text-gray-500">
            Formación interna en lecciones ordenadas. El agente también aprende
            de este material y puede remitirte a la lección donde se explica.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/cursos"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-belsue/40 px-4 py-2 text-sm font-medium text-belsue transition hover:bg-belsue/5"
          >
            Gestionar cursos
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando…</p>}

      {!loading && courses.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? "Aún no hay cursos publicados. Créalos en Administración → Cursos."
              : "Aún no hay cursos publicados."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/procedimientos/cursos/${course.id}`}
            className={`flex flex-col rounded-lg border bg-white p-4 shadow-sm transition hover:border-belsue/40 hover:shadow ${
              course.published
                ? "border-gray-200"
                : "border-dashed border-amber-300"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-800">{course.title}</h3>
              {/* Solo lo ve administración: al equipo no le llegan borradores. */}
              {!course.published && (
                <span
                  title="En borrador: el equipo no lo ve"
                  className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                >
                  Borrador
                </span>
              )}
            </div>
            {course.description && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                {course.description}
              </p>
            )}
            <div className="mt-4">
              <ProgressBar
                done={course.viewed_count}
                total={course.lesson_count}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
