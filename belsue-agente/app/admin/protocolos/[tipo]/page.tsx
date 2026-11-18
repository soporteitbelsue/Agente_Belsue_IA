"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminTabs from "@/components/admin/AdminTabs";
import { Progress, StatusBadge, formatDay } from "@/components/admin/ProtocolBits";
import type { KeyName, ProtocolRecordSummary, ProtocolTemplate } from "@/types";

type Filter = "todas" | "en_curso" | "completada" | "archivadas";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "en_curso", label: "En curso" },
  { value: "completada", label: "Completadas" },
  { value: "archivadas", label: "Archivadas" },
];

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue";

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ProtocolTypePage() {
  const { tipo } = useParams<{ tipo: string }>();
  const router = useRouter();

  const [template, setTemplate] = useState<ProtocolTemplate | null>(null);
  const [departments, setDepartments] = useState<KeyName[]>([]);
  const [records, setRecords] = useState<ProtocolRecordSummary[]>([]);
  const [filter, setFilter] = useState<Filter>("todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Formulario "Nueva ficha"
  const [showForm, setShowForm] = useState(false);
  const [personName, setPersonName] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [department, setDepartment] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Tipo de protocolo y listas (una vez).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/protocolos");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al cargar el protocolo.");
        const tpl = (data.templates as ProtocolTemplate[]).find((t) => t.key === tipo);
        if (!tpl) setNotFound(true);
        setTemplate(tpl ?? null);
        setDepartments(data.departments);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar el protocolo.");
      }
    })();
  }, [tipo]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ tipo, estado: filter });
      const res = await fetch(`/api/admin/protocolos/fichas?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar las fichas.");
      setRecords(data.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar las fichas.");
    } finally {
      setLoading(false);
    }
  }, [tipo, filter]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!personName.trim()) return setFormError("El nombre es obligatorio.");
    if (!startDate) return setFormError("La fecha es obligatoria.");
    if (template?.asks_department && !department) {
      return setFormError("Elige el departamento.");
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/protocolos/fichas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: tipo,
          person_name: personName.trim(),
          start_date: startDate,
          department_key: template?.asks_department ? department : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear la ficha.");
      router.push(`/admin/protocolos/ficha/${data.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al crear la ficha.");
      setCreating(false);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-[1700px] space-y-6 px-4 py-6 sm:px-6">
        <AdminTabs active="/admin/protocolos" />
        <p className="text-sm text-gray-500">
          Ese tipo de protocolo no existe.{" "}
          <Link href="/admin/protocolos" className="text-belsue hover:underline">
            Volver a Protocolos
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/admin/protocolos"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a Protocolos
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {template?.name ?? "Protocolo"}
        </h1>
        {template?.description && (
          <p className="text-sm text-gray-500">{template.description}</p>
        )}
      </div>

      <AdminTabs active="/admin/protocolos" />

      {/* Nueva ficha */}
      {!showForm ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={!template}
            className="rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
          >
            + Nueva ficha
          </button>
          <Link
            href={`/admin/protocolos/${tipo}/plantilla`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Editar plantilla
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-gray-800">Nueva ficha</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-600">Nombre de la persona</span>
              <input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                disabled={creating}
                autoFocus
                className={inputCls}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-600">
                {template?.date_label ?? "Fecha"}
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={creating}
                className={inputCls}
              />
            </label>
            {template?.asks_department && (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-600">Departamento</span>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={creating}
                  className={inputCls}
                >
                  <option value="">Elige…</option>
                  {departments.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-gray-400">
                  Decide qué pasos aparecen en el checklist.
                </span>
              </label>
            )}
          </div>

          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
            >
              {creating ? "Creando…" : "Crear ficha"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
              disabled={creating}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Fichas ({records.length})
          </h2>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  filter === f.value
                    ? "bg-belsue text-white"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        {loading && <p className="text-sm text-gray-400">Cargando…</p>}

        {!loading && records.length === 0 && !error && (
          <p className="text-sm text-gray-500">No hay fichas con este filtro.</p>
        )}

        {!loading && records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 pr-4 font-medium">{template?.date_label ?? "Fecha"}</th>
                  {template?.asks_department && (
                    <th className="py-2 pr-4 font-medium">Departamento</th>
                  )}
                  <th className="py-2 pr-4 font-medium">Progreso</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/admin/protocolos/ficha/${r.id}`)}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-2 pr-4 font-medium text-gray-700">
                      <Link
                        href={`/admin/protocolos/ficha/${r.id}`}
                        className="hover:text-belsue hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.person_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{formatDay(r.start_date)}</td>
                    {template?.asks_department && (
                      <td className="py-2 pr-4 text-gray-500">{r.department_name ?? "—"}</td>
                    )}
                    <td className="py-2 pr-4">
                      <Progress done={r.done_steps} total={r.total_steps} />
                    </td>
                    <td className="py-2">
                      <StatusBadge status={r.status} archived={!!r.archived_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
