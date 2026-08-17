"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";

interface Course {
  id: string;
  title: string;
  lessons: number;
}

interface UserProgress {
  id: string;
  name: string;
  department: string | null;
  progress: { courseId: string; done: number; total: number }[];
}

/** Celda de progreso: hecho, a medias o sin empezar, de un vistazo. */
function Cell({ done, total }: { done: number; total: number }) {
  if (total === 0) {
    return <span className="text-xs text-gray-300">sin lecciones</span>;
  }
  if (done === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  if (done === total) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        ✓ Completo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {done} de {total}
    </span>
  );
}

export default function FormacionPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<UserProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/formacion");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al cargar.");
        setCourses(data.courses as Course[]);
        setUsers(data.users as UserProgress[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a los portales
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Formación</h1>
        <p className="text-sm text-gray-500">
          Qué lleva hecho cada persona de los cursos de Procedimientos
          internos. Útil sobre todo con quien acaba de incorporarse.
        </p>
      </div>

      <AdminTabs active="/admin/formacion" />

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Cargando…</p>}

      {!loading && courses.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
          Todavía no hay cursos creados.{" "}
          <Link
            href="/procedimientos/cursos"
            className="font-medium text-belsue hover:underline"
          >
            Crear el primero
          </Link>
        </div>
      )}

      {!loading && courses.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Persona</th>
                {courses.map((c) => (
                  <th key={c.id} className="px-4 py-2 font-medium">
                    {c.title}
                    <span className="ml-1 font-normal text-gray-400">
                      ({c.lessons})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-700">{u.name}</span>
                    {u.department && (
                      <span className="ml-2 text-xs text-gray-400">
                        {u.department}
                      </span>
                    )}
                  </td>
                  {u.progress.map((p) => (
                    <td key={p.courseId} className="px-4 py-2">
                      <Cell done={p.done} total={p.total} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
