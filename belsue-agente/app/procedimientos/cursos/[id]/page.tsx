"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LessonForm from "@/components/cursos/LessonForm";
import type { CourseWithLessons, Lesson } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  pptx: "PowerPoint",
  pdf: "PDF",
  docx: "Word",
  txt: "Texto",
  nota: "Nota",
};

/** Tipos que se pueden leer sin salir de la página (ver /api/documents/[id]/view). */
const VIEWABLE = new Set(["pdf", "txt"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CursoPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseWithLessons | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Lección abierta en el visor y su enlace firmado.
  const [viewer, setViewer] = useState<{ id: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${params.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar el curso.");
      setCourse(data.course as CourseWithLessons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Marca o desmarca una lección como vista (optimista). */
  async function toggleViewed(lesson: Lesson) {
    const next = !lesson.viewed;
    setCourse((prev) =>
      prev
        ? {
            ...prev,
            lessons: prev.lessons.map((l) =>
              l.id === lesson.id ? { ...l, viewed: next } : l,
            ),
          }
        : prev,
    );
    try {
      await fetch(`/api/lessons/${lesson.id}/view`, {
        method: next ? "POST" : "DELETE",
      });
    } catch {
      load(); // si falla, recargamos el estado real
    }
  }

  /**
   * Abre la lección en el visor incrustado (PDF y texto). Al abrirla se da por
   * vista, que es el gesto natural: si la estás leyendo, la has visto.
   */
  async function openMaterial(lesson: Lesson) {
    if (viewer?.id === lesson.id) {
      setViewer(null); // segundo clic: cerrar
      return;
    }
    setOpeningId(lesson.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${lesson.document_id}/view`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo abrir.");
      setViewer({ id: lesson.id, url: data.url as string });
      if (!lesson.viewed) await toggleViewed(lesson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir.");
    } finally {
      setOpeningId(null);
    }
  }

  /** Descarga el material (para los formatos que el navegador no muestra). */
  async function downloadMaterial(lesson: Lesson) {
    setOpeningId(lesson.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${lesson.document_id}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo descargar.");
      window.open(data.url, "_blank");
      if (!lesson.viewed) await toggleViewed(lesson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar.");
    } finally {
      setOpeningId(null);
    }
  }

  async function removeLesson(lesson: Lesson) {
    await fetch(`/api/lessons/${lesson.id}`, { method: "DELETE" });
    load();
  }

  async function deleteCourse() {
    await fetch(`/api/courses/${params.id}`, { method: "DELETE" });
    router.push("/procedimientos/cursos");
  }

  if (loading) {
    return <p className="p-6 text-sm text-gray-400">Cargando…</p>;
  }

  if (!course) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">{error ?? "Curso no encontrado."}</p>
        <Link
          href="/procedimientos/cursos"
          className="mt-2 inline-block text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a los cursos
        </Link>
      </div>
    );
  }

  const total = course.lessons.length;
  const done = course.lessons.filter((l) => l.viewed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 overflow-y-auto px-4 py-6">
      <div>
        <Link
          href="/procedimientos/cursos"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a los cursos
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">{course.title}</h1>
        {course.description && (
          <p className="mt-1 text-sm text-gray-500">{course.description}</p>
        )}

        {total > 0 && (
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${
                  done === total ? "bg-green-500" : "bg-belsue"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {done === total
                ? "✓ Has completado este curso"
                : `${done} de ${total} lecciones vistas`}
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {total === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
          Este curso todavía no tiene lecciones.
        </div>
      )}

      <ol className="space-y-3">
        {course.lessons.map((lesson, i) => (
          <li
            key={lesson.id}
            style={{ animationDelay: `${i * 0.05}s` }}
            className={`animate-rise flex gap-3 rounded-lg border bg-white p-4 shadow-sm transition ${
              lesson.viewed ? "border-green-200" : "border-gray-200"
            }`}
          >
            <button
              onClick={() => toggleViewed(lesson)}
              title={lesson.viewed ? "Marcar como no vista" : "Marcar como vista"}
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${
                lesson.viewed
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-gray-300 text-gray-400 hover:border-belsue hover:text-belsue"
              }`}
            >
              {lesson.viewed ? (
                <svg className="animate-pop h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                i + 1
              )}
            </button>

            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-gray-800">{lesson.title}</h3>
              {lesson.description && (
                <p className="mt-0.5 text-sm text-gray-500">
                  {lesson.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
                  {TYPE_LABEL[lesson.file_type] ?? lesson.file_type}
                </span>
                <span>{formatBytes(lesson.file_size)}</span>
                {!lesson.downloadable ? (
                  <span title="Sin archivo original disponible">
                    Material no disponible
                  </span>
                ) : VIEWABLE.has(lesson.file_type) ? (
                  <>
                    <button
                      onClick={() => openMaterial(lesson)}
                      disabled={openingId === lesson.id}
                      className="font-medium text-belsue hover:underline disabled:opacity-50"
                    >
                      {openingId === lesson.id
                        ? "Abriendo…"
                        : viewer?.id === lesson.id
                          ? "Cerrar lección"
                          : "Ver lección"}
                    </button>
                    <button
                      onClick={() => downloadMaterial(lesson)}
                      className="text-gray-400 hover:text-belsue"
                    >
                      Descargar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => downloadMaterial(lesson)}
                    disabled={openingId === lesson.id}
                    title="Este formato no se puede ver dentro de la página. Súbelo en PDF para leerlo aquí."
                    className="font-medium text-belsue hover:underline disabled:opacity-50"
                  >
                    {openingId === lesson.id ? "Abriendo…" : "Descargar material"}
                  </button>
                )}
                <button
                  onClick={() => removeLesson(lesson)}
                  className="ml-auto text-gray-300 hover:text-red-500"
                  title="Quitar del curso (el documento no se borra)"
                >
                  Quitar
                </button>
              </div>

              {/* Visor incrustado: la lección se lee sin salir de la página. */}
              {viewer?.id === lesson.id && (
                <div className="mt-3 overflow-hidden rounded-md border border-gray-200">
                  <iframe
                    src={viewer.url}
                    title={lesson.title}
                    className="h-[70vh] w-full bg-gray-50"
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {adding ? (
        <LessonForm
          courseId={params.id}
          onAdded={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white transition hover:bg-belsue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Añadir lección
        </button>
      )}

      <div className="border-t border-gray-100 pt-4">
        {confirmDelete ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              ¿Borrar el curso? Las lecciones dejan de estar agrupadas, pero los
              documentos siguen disponibles.
            </span>
            <button
              onClick={deleteCourse}
              className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white"
            >
              Borrar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded bg-gray-200 px-2.5 py-1 text-xs text-gray-700"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs font-medium text-gray-400 hover:text-red-500"
          >
            Borrar curso
          </button>
        )}
      </div>
    </div>
  );
}
