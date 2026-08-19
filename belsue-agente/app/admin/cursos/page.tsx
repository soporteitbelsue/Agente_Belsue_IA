"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import type { CourseSummary } from "@/types";

/** Los cursos son formación interna: viven en el portal de procedimientos. */
const SCOPE = "procedimientos";

export default function AdminCursosPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          scope: SCOPE,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el curso.");
      setTitle("");
      setDescription("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(course: CourseSummary) {
    const published = !course.published;
    setCourses((prev) =>
      prev.map((c) => (c.id === course.id ? { ...c, published } : c)),
    );
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      });
      if (!res.ok) throw new Error();
    } catch {
      load();
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
          >
            ← Volver a los portales
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">Cursos</h1>
          <p className="text-sm text-gray-500">
            La formación interna se prepara aquí. El equipo la consulta en{" "}
            <Link
              href="/procedimientos/cursos"
              className="font-medium text-belsue hover:underline"
            >
              Procedimientos → Cursos
            </Link>
            , donde solo ve los publicados.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white transition hover:bg-belsue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo curso
          </button>
        )}
      </div>

      <AdminTabs active="/admin/cursos" />

      {creating && (
        <form
          onSubmit={createCourse}
          className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold text-gray-800">Nuevo curso</h2>
          <p className="text-sm text-gray-500">
            Se crea en borrador: podrás subirle las lecciones y ordenarlas antes
            de que lo vea nadie.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Título <span className="text-belsue">*</span>
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              disabled={saving}
              placeholder="Ej: Bienvenida: cómo funciona la oficina"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-600">
              Descripción
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={saving}
              placeholder="Para quién es y qué se lleva quien lo haga"
              className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
            >
              {saving ? "Creando…" : "Crear curso"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando…</p>}

      {!loading && courses.length === 0 && !creating && (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
          Aún no hay cursos. Crea el primero y añádele sus lecciones.
        </div>
      )}

      {courses.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Curso</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Lecciones</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">
                      {course.title}
                    </span>
                    {course.description && (
                      <span className="mt-0.5 line-clamp-1 block max-w-xl text-xs text-gray-500">
                        {course.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {course.published ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Publicado
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Borrador
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {course.lesson_count === 0 ? (
                      <span className="text-amber-700">Sin lecciones</span>
                    ) : (
                      course.lesson_count
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/procedimientos/cursos/${course.id}`}
                        className="font-medium text-belsue hover:underline"
                      >
                        Gestionar lecciones
                      </Link>
                      <button
                        onClick={() => togglePublished(course)}
                        className="font-medium text-gray-500 hover:text-belsue hover:underline"
                      >
                        {course.published ? "Ocultar" : "Publicar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
