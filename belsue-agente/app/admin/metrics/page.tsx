"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MetricsChart from "@/components/admin/MetricsChart";
import type { DayMetrics, UserMetrics } from "@/types";

interface Overview {
  days: DayMetrics[];
  totals: {
    total_conversations: number;
    total_messages: number;
    total_users_active: number;
    avg_response_quality: number | null;
  };
}

type SortKey = "user_name" | "department" | "total_conversations" | "total_messages" | "last_active";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-belsue">{value}</p>
    </div>
  );
}

export default function MetricsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "total_conversations",
    dir: "desc",
  });

  useEffect(() => {
    (async () => {
      try {
        const [oRes, uRes] = await Promise.all([
          fetch("/api/admin/metrics/overview"),
          fetch("/api/admin/metrics/users"),
        ]);
        const oData = await oRes.json();
        const uData = await uRes.json();
        if (!oRes.ok) throw new Error(oData.error ?? "Error al cargar métricas.");
        if (!uRes.ok) throw new Error(uData.error ?? "Error al cargar usuarios.");
        setOverview(oData);
        setUsers(uData.users ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sortedUsers = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [users, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }

  const busiestDay = overview?.days.reduce<DayMetrics | null>(
    (max, d) =>
      !max || d.total_conversations > max.total_conversations ? d : max,
    null,
  );
  const avgMessages =
    overview && overview.totals.total_conversations > 0
      ? (
          overview.totals.total_messages / overview.totals.total_conversations
        ).toFixed(1)
      : "0";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto px-4 py-6">
      <div>
        <Link
          href="/chat"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver al chat
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Métricas de uso</h1>
        <p className="text-sm text-gray-500">
          Datos agregados de uso del asistente. No se muestra el contenido de las
          conversaciones.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-gray-200">
        <Link
          href="/admin"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Documentos
        </Link>
        <Link
          href="/admin/usuarios"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Usuarios
        </Link>
        <span className="border-b-2 border-belsue px-4 py-2 text-sm font-semibold text-belsue">
          Métricas
        </span>
      </div>

      {loading && <p className="text-sm text-gray-400">Cargando métricas…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {overview && (
        <>
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card
              label="Total de consultas"
              value={String(overview.totals.total_conversations)}
            />
            <Card
              label="Asesores activos"
              value={String(overview.totals.total_users_active)}
            />
            <Card label="Media mensajes/consulta" value={avgMessages} />
            <Card
              label="Día más activo"
              value={
                busiestDay
                  ? new Date(busiestDay.day).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                    })
                  : "—"
              }
            />
          </div>

          {/* Gráfica */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              Consultas por día (últimos 30 días)
            </h2>
            {overview.days.length > 0 ? (
              <MetricsChart days={overview.days} />
            ) : (
              <p className="text-sm text-gray-400">Aún no hay datos.</p>
            )}
          </div>

          {/* Tabla por asesor */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              Uso por asesor
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-500">
                  <tr>
                    {(
                      [
                        ["user_name", "Nombre"],
                        ["department", "Departamento"],
                        ["total_conversations", "Consultas"],
                        ["total_messages", "Mensajes"],
                        ["last_active", "Última actividad"],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="cursor-pointer py-2 pr-4 font-medium hover:text-gray-700"
                      >
                        {label}
                        {sort.key === key && (sort.dir === "asc" ? " ↑" : " ↓")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u) => (
                    <tr key={u.user_id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium text-gray-700">
                        {u.user_name}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        {u.department ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        {u.total_conversations}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        {u.total_messages}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        {u.last_active
                          ? new Date(u.last_active).toLocaleDateString("es-ES")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {sortedUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-400">
                        Sin datos de usuarios.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
