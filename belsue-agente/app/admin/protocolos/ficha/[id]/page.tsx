"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminTabs from "@/components/admin/AdminTabs";
import {
  Progress,
  StatusBadge,
  formatDateTime,
  formatDay,
} from "@/components/admin/ProtocolBits";
import type {
  KeyName,
  ProtocolLogEntry,
  ProtocolRecordStep,
  ProtocolRecordSummary,
} from "@/types";

interface FichaData {
  record: ProtocolRecordSummary;
  template: { key: string; name: string; asks_department: boolean; date_label: string } | null;
  steps: ProtocolRecordStep[];
  log: ProtocolLogEntry[];
  roles: KeyName[];
}

/** Frase del historial: "marcó el paso 3", "cambió el responsable…". */
function describeLog(entry: ProtocolLogEntry, stepLabel: string | null): string {
  const paso = stepLabel ? `«${stepLabel}»` : "un paso";
  switch (entry.action) {
    case "crear":
      return "creó la ficha";
    case "marcar":
      return `marcó ${paso} como hecho`;
    case "desmarcar":
      return `desmarcó ${paso}`;
    case "cambiar_responsable":
      return `cambió el responsable de ${paso}: ${entry.old_value ?? "—"} → ${entry.new_value ?? "—"}`;
    case "observaciones":
      return entry.new_value
        ? `cambió las observaciones de ${paso}: «${entry.new_value}»`
        : `borró las observaciones de ${paso}`;
    case "completar":
      return "la ficha quedó completada";
    case "reabrir":
      return "la ficha volvió a estar en curso";
    case "archivar":
      return "archivó la ficha";
    case "desarchivar":
      return "desarchivó la ficha";
    case "editar_texto":
      return `cambió el texto de una tarea: «${entry.old_value ?? ""}» → «${entry.new_value ?? ""}»`;
    case "anadir_paso":
      return `añadió la tarea «${entry.new_value ?? ""}»`;
    default:
      return entry.action;
  }
}

type StepPatch = {
  text?: string;
  completed?: boolean;
  role_key?: string;
  notes?: string | null;
};

/** Formulario para añadir una tarea extra solo a esta ficha. */
function AddStepForm({
  roles,
  onAdd,
}: {
  roles: KeyName[];
  onAdd: (text: string, roleKey: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-belsue hover:border-belsue hover:bg-belsue/5"
      >
        + Añadir tarea a esta ficha
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onAdd(text.trim(), roleKey);
        setBusy(false);
        if (ok) {
          setText("");
          setRoleKey("");
          setOpen(false);
        }
      }}
      className="space-y-3 rounded-lg border border-belsue/30 bg-white p-4"
    >
      <p className="text-xs text-gray-500">
        Solo para esta persona. La plantilla no cambia.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          autoFocus
          maxLength={500}
          placeholder="Descripción de la tarea"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
        />
        <select
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
          disabled={busy}
          aria-label="Responsable"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
        >
          <option value="">Responsable…</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !text.trim() || !roleKey}
          className="rounded-md bg-belsue px-3 py-1.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
        >
          {busy ? "Añadiendo…" : "Añadir tarea"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function StepRow({
  step,
  roles,
  busy,
  onChange,
}: {
  step: ProtocolRecordStep;
  roles: KeyName[];
  busy: boolean;
  onChange: (patch: StepPatch) => void;
}) {
  const [draft, setDraft] = useState(step.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!step.notes);
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState(step.text);

  useEffect(() => {
    setTextDraft(step.text);
    setEditingText(false);
  }, [step.text]);

  // Si la ficha se recarga, el borrador sigue a lo guardado.
  useEffect(() => {
    setDraft(step.notes ?? "");
  }, [step.notes]);

  const dirty = draft.trim() !== (step.notes ?? "");

  return (
    <li
      className={`rounded-lg border p-4 ${
        step.completed ? "border-green-200 bg-green-50/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          checked={step.completed}
          onChange={(e) => onChange({ completed: e.target.checked })}
          disabled={busy}
          aria-label={`Marcar: ${step.text}`}
          className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-belsue disabled:cursor-wait"
        />
        <div className="min-w-0 flex-1">
          {editingText ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (textDraft.trim() && textDraft.trim() !== step.text) {
                  onChange({ text: textDraft.trim() });
                } else {
                  setEditingText(false);
                }
              }}
              className="flex flex-wrap gap-2"
            >
              <input
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                disabled={busy}
                autoFocus
                maxLength={500}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
              />
              <button
                type="submit"
                disabled={busy || !textDraft.trim()}
                className="rounded-md bg-belsue px-3 py-1 text-xs font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setTextDraft(step.text);
                  setEditingText(false);
                }}
                disabled={busy}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <p
              className={`text-sm font-medium ${
                step.completed ? "text-gray-500 line-through decoration-gray-400" : "text-gray-800"
              }`}
            >
              <span className="mr-1 tabular-nums text-gray-400">{step.position}.</span>
              {step.text}
              {step.is_extra && (
                <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 align-middle text-[11px] font-medium text-sky-700 no-underline">
                  Añadida en esta ficha
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditingText(true)}
                disabled={busy}
                className="ml-2 align-middle text-xs font-normal text-belsue hover:underline"
              >
                Editar
              </button>
            </p>
          )}
          {step.help && <p className="mt-1 text-xs text-gray-500">{step.help}</p>}
          {step.completed && (
            <p className="mt-1 text-xs text-green-700">
              Hecho por {step.completed_by_name ?? "—"} · {formatDateTime(step.completed_at)}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Responsable
          <select
            value={step.role_key}
            onChange={(e) => onChange({ role_key: e.target.value })}
            disabled={busy}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {step.allows_notes && (
        <div className="mt-3 pl-8">
          {!showNotes ? (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-xs font-medium text-belsue hover:underline"
            >
              + Añadir observaciones
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy}
                rows={2}
                maxLength={2000}
                placeholder="Observaciones (opcional)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
              />
              {dirty && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ notes: draft.trim() || null })}
                    disabled={busy}
                    className="rounded-md bg-belsue px-3 py-1.5 text-xs font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
                  >
                    Guardar observaciones
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft(step.notes ?? "")}
                    disabled={busy}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function FichaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<FichaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [busyRecord, setBusyRecord] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/protocolos/fichas/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar la ficha.");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la ficha.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const stepLabels = useMemo(() => {
    const map = new Map<string, string>();
    data?.steps.forEach((s) => map.set(s.id, `${s.position}. ${s.text}`));
    return map;
  }, [data?.steps]);

  async function addStep(text: string, roleKey: string): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(`/api/admin/protocolos/fichas/${id}/pasos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, role_key: roleKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al añadir la tarea.");
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al añadir la tarea.");
      return false;
    }
  }

  async function updateStep(stepId: string, patch: StepPatch) {
    setBusyStep(stepId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/protocolos/pasos/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar el cambio.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el cambio.");
    } finally {
      setBusyStep(null);
    }
  }

  async function toggleArchived() {
    if (!data) return;
    setBusyRecord(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/protocolos/fichas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !data.record.archived_at }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al archivar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al archivar.");
    } finally {
      setBusyRecord(false);
    }
  }

  async function deleteRecord() {
    if (!data) return;
    const typed = window.prompt(
      `Se borrará la ficha de ${data.record.person_name} con todo su checklist ` +
        `y su historial. No se puede deshacer.\n\n` +
        `Si solo quieres quitarla de la lista, usa Archivar.\n\n` +
        `Para confirmar, escribe el nombre de la persona:`,
    );
    if (typed === null) return;
    if (typed.trim() !== data.record.person_name.trim()) {
      setError("El nombre no coincide. No se ha borrado nada.");
      return;
    }

    setBusyRecord(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/protocolos/fichas/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al borrar la ficha.");
      router.push(`/admin/protocolos/${data.record.template_key}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al borrar la ficha.");
      setBusyRecord(false);
    }
  }

  const record = data?.record;
  const backHref = record ? `/admin/protocolos/${record.template_key}` : "/admin/protocolos";

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a {data?.template?.name ?? "Protocolos"}
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {record?.person_name ?? (loading ? "Cargando…" : "Ficha")}
        </h1>
        {record && (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>{data?.template?.name}</span>
            <span>
              {data?.template?.date_label ?? "Fecha"}: {formatDay(record.start_date)}
            </span>
            {record.department_name && <span>Departamento: {record.department_name}</span>}
            <Progress done={record.done_steps} total={record.total_steps} />
            <StatusBadge status={record.status} archived={!!record.archived_at} />
          </div>
        )}
      </div>

      <AdminTabs active="/admin/protocolos" />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {data && record && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Checklist */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-800">Checklist</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleArchived}
                  disabled={busyRecord}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  {record.archived_at ? "Desarchivar" : "Archivar"}
                </button>
                <button
                  type="button"
                  onClick={deleteRecord}
                  disabled={busyRecord}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Borrar ficha
                </button>
              </div>
            </div>

            {data.steps.length === 0 && (
              <p className="text-sm text-gray-500">Esta ficha no tiene pasos.</p>
            )}
            <ol className="space-y-3">
              {data.steps.map((s) => (
                <StepRow
                  key={s.id}
                  step={s}
                  roles={data.roles}
                  busy={busyStep === s.id}
                  onChange={(patch) => updateStep(s.id, patch)}
                />
              ))}
            </ol>
            <AddStepForm roles={data.roles} onAdd={addStep} />
          </section>

          {/* Historial */}
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:self-start">
            <h2 className="mb-3 text-lg font-semibold text-gray-800">Historial</h2>
            {data.log.length === 0 ? (
              <p className="text-sm text-gray-500">Sin cambios todavía.</p>
            ) : (
              <ol className="space-y-3">
                {data.log.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-belsue/30 pl-3 text-sm">
                    <p className="text-gray-700">
                      <span className="font-medium">{entry.user_name ?? "Alguien"}</span>{" "}
                      {describeLog(
                        entry,
                        entry.step_id ? stepLabels.get(entry.step_id) ?? null : null,
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
