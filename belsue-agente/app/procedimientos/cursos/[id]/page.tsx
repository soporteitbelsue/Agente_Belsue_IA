"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  // El temario lo mantiene administración; el resto del equipo lo sigue y
  // marca sus lecciones como vistas.
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [course, setCourse] = useState<CourseWithLessons | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Lección abierta en el visor a pantalla completa, con su enlace firmado.
  const [viewer, setViewer] = useState<{
    id: string;
    url: string;
    title: string;
  } | null>(null);
  // Edición del título y la descripción del curso.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingCourse, setSavingCourse] = useState(false);

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
    setOpeningId(lesson.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${lesson.document_id}/view`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo abrir.");
      setViewer({
        id: lesson.id,
        url: data.url as string,
        title: lesson.title,
      });
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

  /**
   * Sube o baja una lección dentro del curso. Reescribe la posición de todas
   * las que no cuadren con su sitio en la lista: así se normalizan de paso los
   * huecos que dejan las lecciones borradas.
   */
  async function moveLesson(index: number, direction: -1 | 1) {
    if (!course) return;
    const target = index + direction;
    if (target < 0 || target >= course.lessons.length) return;

    const reordered = [...course.lessons];
    const moved = reordered[index]!;
    reordered[index] = reordered[target]!;
    reordered[target] = moved;

    setCourse({ ...course, lessons: reordered }); // optimista
    setViewer(null); // el visor abierto dejaría de corresponder a su fila

    try {
      await Promise.all(
        reordered.map((lesson, i) =>
          lesson.position === i
            ? null
            : fetch(`/api/lessons/${lesson.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ position: i }),
              }),
        ),
      );
    } catch {
      /* si algo falla, la recarga deja el orden real */
    }
    load();
  }

  /** Guarda el título y la descripción del curso. */
  async function saveCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setSavingCourse(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
      setEditing(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSavingCourse(false);
    }
  }

  async function deleteCourse() {
    await fetch(`/api/courses/${params.id}`, { method: "DELETE" });
    router.push("/procedimientos/cursos");
  }

  // Escape cierra el visor, que es lo que espera cualquiera a pantalla completa.
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

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
        {editing ? (
          <form onSubmit={saveCourse} className="space-y-3">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
              autoFocus
              disabled={savingCourse}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-lg font-semibold focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              disabled={savingCourse}
              placeholder="Descripción del curso"
              className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingCourse || !editTitle.trim()}
                className="rounded-lg bg-belsue px-4 py-1.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
              >
                {savingCourse ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                {course.title}
              </h1>
              {course.description && (
                <p className="mt-1 text-sm text-gray-500">
                  {course.description}
                </p>
              )}
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setEditTitle(course.title);
                  setEditDescription(course.description ?? "");
                  setEditing(true);
                }}
                className="shrink-0 text-sm font-medium text-belsue hover:underline"
              >
                Editar
              </button>
            )}
          </div>
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
                      {openingId === lesson.id ? "Abriendo…" : "Ver lección"}
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
                {isAdmin && (
                <span className="ml-auto flex items-center gap-1.5">
                  {/* Reordenar: el orden de las lecciones es el del curso. */}
                  <button
                    onClick={() => moveLesson(i, -1)}
                    disabled={i === 0}
                    title="Subir la lección"
                    aria-label="Subir la lección"
                    className="rounded p-0.5 text-gray-300 transition hover:bg-gray-100 hover:text-belsue disabled:invisible"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveLesson(i, 1)}
                    disabled={i === course.lessons.length - 1}
                    title="Bajar la lección"
                    aria-label="Bajar la lección"
                    className="rounded p-0.5 text-gray-300 transition hover:bg-gray-100 hover:text-belsue disabled:invisible"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeLesson(lesson)}
                    className="text-gray-300 hover:text-red-500"
                    title="Quitar del curso (el documento no se borra)"
                  >
                    Quitar
                  </button>
                </span>
                )}
              </div>

            </div>
          </li>
        ))}
      </ol>

      {!isAdmin ? null : adding ? (
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

      {/* Visor a pantalla completa: una lección se lee, no se ojea en una
          columna estrecha. Ocupa todo salvo su propia barra de título. */}
      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="truncate text-sm font-medium">
                {viewer.title}
              </span>
              <span className="hidden shrink-0 text-xs text-white/50 sm:inline">
                {course.title}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {(() => {
                const index = course.lessons.findIndex(
                  (l) => l.id === viewer.id,
                );
                const previous = course.lessons[index - 1];
                const next = course.lessons[index + 1];
                return (
                  <>
                    <span className="hidden text-xs text-white/50 sm:inline">
                      Lección {index + 1} de {course.lessons.length}
                    </span>
                    <button
                      onClick={() => previous && openMaterial(previous)}
                      disabled={!previous}
                      className="rounded-md px-2 py-1 text-sm text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      ← Anterior
                    </button>
                    <button
                      onClick={() => next && openMaterial(next)}
                      disabled={!next}
                      className="rounded-md px-2 py-1 text-sm text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      Siguiente →
                    </button>
                  </>
                );
              })()}

              <button
                onClick={() => setViewer(null)}
                title="Cerrar (Esc)"
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Cerrar
              </button>
            </div>
          </div>

          <iframe
            src={viewer.url}
            title={viewer.title}
            className="flex-1 w-full border-0 bg-white"
          />
        </div>
      )}

      <div className={isAdmin ? "border-t border-gray-100 pt-4" : "hidden"}>
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
