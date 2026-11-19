"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import { AccessTypeBadge } from "@/components/admin/ProtocolBits";
import type { CompanyAccessType, ProtocolCompany } from "@/types";

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue";

interface Draft {
  name: string;
  access_type: CompanyAccessType | "";
  notes: string;
}

const EMPTY: Draft = { name: "", access_type: "", notes: "" };

/** General / Particular como dos botones: se ve de un vistazo y no hay que desplegar nada. */
function AccessTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: CompanyAccessType | "";
  onChange: (v: CompanyAccessType) => void;
  disabled?: boolean;
}) {
  const options: { v: CompanyAccessType; label: string; hint: string }[] = [
    { v: "general", label: "General", hint: "Mismas credenciales para todos" },
    { v: "particular", label: "Particular", hint: "Cada persona tiene las suyas" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          disabled={disabled}
          aria-pressed={value === o.v}
          title={o.hint}
          className={`rounded-md border px-3 py-2 text-left text-sm ${
            value === o.v
              ? "border-belsue bg-belsue/10 text-belsue"
              : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="block font-medium">{o.label}</span>
          <span className="block text-xs opacity-80">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<ProtocolCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<(Draft & { id: string }) | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/protocolos/companias");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar las compañías.");
      setCompanies(data.companies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar las compañías.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(request: () => Promise<Response>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await request();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se ha podido guardar.");
      onOk?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se ha podido guardar.");
    } finally {
      setBusy(false);
    }
  }

  const body = (d: Draft) =>
    JSON.stringify({
      name: d.name.trim(),
      access_type: d.access_type,
      notes: d.notes.trim() || null,
    });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return setError("Escribe el nombre de la compañía.");
    if (!draft.access_type) return setError("Elige si el acceso es general o particular.");
    run(
      () =>
        fetch("/api/admin/protocolos/companias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body(draft),
        }),
      () => setDraft(EMPTY),
    );
  }

  function handleSave() {
    if (!editing) return;
    run(
      () =>
        fetch(`/api/admin/protocolos/companias/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: body(editing),
        }),
      () => setEditing(null),
    );
  }

  function handleRemove(c: ProtocolCompany) {
    if (
      !window.confirm(
        `¿Quitar ${c.name} de la lista?\n\nDejará de salir en las fichas nuevas. ` +
          `Las fichas ya creadas la conservan.`,
      )
    )
      return;
    run(() => fetch(`/api/admin/protocolos/companias/${c.id}`, { method: "DELETE" }));
  }

  const generales = companies.filter((c) => c.access_type === "general").length;

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/admin/protocolos"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a Protocolos
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Compañías</h1>
        <p className="text-sm text-gray-500">
          Las compañías con las que trabajamos. Salen como lista de checks en la tarea
          «Accesos a las webs de compañías y códigos» de cada nuevo empleado.
        </p>
      </div>

      <AdminTabs active="/admin/protocolos" />

      {/* Alta */}
      <form
        onSubmit={handleAdd}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-gray-800">Añadir compañía</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">Nombre</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={busy}
              maxLength={200}
              placeholder="Ej: Mapfre"
              className={inputCls}
            />
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">Acceso</span>
            <AccessTypePicker
              value={draft.access_type}
              onChange={(v) => setDraft({ ...draft, access_type: v })}
              disabled={busy}
            />
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-600">Notas (opcional)</span>
            <input
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              disabled={busy}
              maxLength={1000}
              placeholder="Ej: pedir el usuario al gestor de la compañía"
              className={inputCls}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
        >
          {busy ? "Guardando…" : "Añadir compañía"}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Lista */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">
          Lista ({companies.length})
        </h2>
        {companies.length > 0 && (
          <p className="mb-4 text-xs text-gray-500">
            {generales} general{generales === 1 ? "" : "es"} ·{" "}
            {companies.length - generales} particular
            {companies.length - generales === 1 ? "" : "es"}
          </p>
        )}

        {loading && <p className="text-sm text-gray-400">Cargando…</p>}
        {!loading && companies.length === 0 && (
          <p className="text-sm text-gray-500">Todavía no hay compañías. Añade la primera arriba.</p>
        )}

        {companies.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {companies.map((c) =>
              editing?.id === c.id ? (
                <li key={c.id} className="space-y-3 py-3">
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    disabled={busy}
                    maxLength={200}
                    autoFocus
                    className={inputCls}
                  />
                  <AccessTypePicker
                    value={editing.access_type}
                    onChange={(v) => setEditing({ ...editing, access_type: v })}
                    disabled={busy}
                  />
                  <input
                    value={editing.notes}
                    onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                    disabled={busy}
                    maxLength={1000}
                    placeholder="Notas (opcional)"
                    className={inputCls}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={busy || !editing.name.trim()}
                      className="rounded-md bg-belsue px-3 py-1.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      disabled={busy}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </li>
              ) : (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                    {c.notes && <p className="text-xs text-gray-500">{c.notes}</p>}
                  </div>
                  <AccessTypeBadge type={c.access_type} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          name: c.name,
                          access_type: c.access_type,
                          notes: c.notes ?? "",
                        })
                      }
                      disabled={busy}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(c)}
                      disabled={busy}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
