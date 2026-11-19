"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminTabs from "@/components/admin/AdminTabs";
import type { KeyName, ProtocolTemplateStep } from "@/types";

interface TemplateInfo {
  key: string;
  name: string;
  description: string | null;
  asks_department: boolean;
}

interface StepDraft {
  text: string;
  help: string;
  default_role: string;
  allows_notes: boolean;
  departments: string[];
}

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue";

function draftFrom(step: ProtocolTemplateStep): StepDraft {
  return {
    text: step.text,
    help: step.help ?? "",
    default_role: step.default_role,
    allows_notes: step.allows_notes,
    departments: step.condition?.departments ?? [],
  };
}

/** Formulario de una tarea: el mismo para añadir y para editar. */
function StepForm({
  initial,
  roles,
  departments,
  asksDepartment,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: StepDraft;
  roles: KeyName[];
  departments: KeyName[];
  asksDepartment: boolean;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: StepDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<StepDraft>(initial);
  const set = <K extends keyof StepDraft>(k: K, v: StepDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(d);
      }}
      className="space-y-3"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">Tarea</span>
        <input
          value={d.text}
          onChange={(e) => set("text", e.target.value)}
          disabled={busy}
          autoFocus
          maxLength={500}
          className={inputCls}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">Ayuda (opcional)</span>
        <input
          value={d.help}
          onChange={(e) => set("help", e.target.value)}
          disabled={busy}
          maxLength={1000}
          placeholder="Explicación que se ve debajo de la tarea"
          className={inputCls}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-600">Responsable por defecto</span>
          <select
            value={d.default_role}
            onChange={(e) => set("default_role", e.target.value)}
            disabled={busy}
            className={inputCls}
          >
            <option value="">Elige…</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={d.allows_notes}
            onChange={(e) => set("allows_notes", e.target.checked)}
            disabled={busy}
            className="h-4 w-4 accent-belsue"
          />
          Admite observaciones
        </label>
      </div>

      {asksDepartment && (
        <fieldset className="text-sm">
          <legend className="mb-1 font-medium text-gray-600">
            Solo para estos departamentos{" "}
            <span className="font-normal text-gray-400">(ninguno marcado = para todos)</span>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {departments.map((dep) => (
              <label key={dep.key} className="flex items-center gap-1.5 text-gray-600">
                <input
                  type="checkbox"
                  checked={d.departments.includes(dep.key)}
                  onChange={(e) =>
                    set(
                      "departments",
                      e.target.checked
                        ? [...d.departments, dep.key]
                        : d.departments.filter((k) => k !== dep.key),
                    )
                  }
                  disabled={busy}
                  className="h-4 w-4 accent-belsue"
                />
                {dep.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !d.text.trim() || !d.default_role}
          className="rounded-md bg-belsue px-3 py-1.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
        >
          {busy ? "Guardando…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function TemplateEditorPage() {
  const { tipo } = useParams<{ tipo: string }>();

  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [steps, setSteps] = useState<ProtocolTemplateStep[]>([]);
  const [roles, setRoles] = useState<KeyName[]>([]);
  const [departments, setDepartments] = useState<KeyName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/protocolos/plantillas/${tipo}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar la plantilla.");
      setTemplate(data.template);
      setSteps(data.steps);
      setRoles(data.roles);
      setDepartments(data.departments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la plantilla.");
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    load();
  }, [load]);

  /** Lanza una petición, recarga y deja el error a la vista si falla. */
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
      // Lo pintado en pantalla puede no ser lo guardado (p. ej. un reordenado
      // que ha fallado): se vuelve a lo que hay en la base.
      await load();
    } finally {
      setBusy(false);
    }
  }

  const payload = (d: StepDraft) =>
    JSON.stringify({
      text: d.text.trim(),
      help: d.help.trim() || null,
      default_role: d.default_role,
      allows_notes: d.allows_notes,
      departments: d.departments,
    });

  function addStep(d: StepDraft) {
    run(
      () =>
        fetch(`/api/admin/protocolos/plantillas/${tipo}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload(d),
        }),
      () => setAdding(false),
    );
  }

  function saveStep(id: string, d: StepDraft) {
    run(
      () =>
        fetch(`/api/admin/protocolos/plantillas/${tipo}/pasos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: payload(d),
        }),
      () => setEditingId(null),
    );
  }

  function removeStep(step: ProtocolTemplateStep) {
    if (
      !window.confirm(
        `¿Quitar la tarea «${step.text}» de la plantilla?\n\n` +
          `Las fichas ya creadas la conservan; solo dejará de salir en las nuevas.`,
      )
    )
      return;
    run(() =>
      fetch(`/api/admin/protocolos/plantillas/${tipo}/pasos/${step.id}`, {
        method: "DELETE",
      }),
    );
  }

  /**
   * Mueve la tarea de `from` para que quede delante de la que ahora ocupa
   * `insertAt` (0..n; n = al final). El orden nuevo se pinta al momento y
   * luego se guarda; si falla, `run` recarga el orden real.
   */
  function reorder(from: number, insertAt: number) {
    const to = insertAt > from ? insertAt - 1 : insertAt;
    if (to === from || to < 0 || to >= steps.length) return;
    const next = [...steps];
    const moved = next.splice(from, 1);
    next.splice(to, 0, ...moved);
    setSteps(next);
    run(() =>
      fetch(`/api/admin/protocolos/plantillas/${tipo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((s) => s.id) }),
      }),
    );
  }

  /** Flechas: una posición arriba o abajo. */
  function move(index: number, delta: -1 | 1) {
    reorder(index, delta === -1 ? index - 1 : index + 2);
  }

  // --- Arrastrar y soltar (nativo del navegador, sin librerías) ---
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Hueco donde caería: 0..n (delante de la tarea i; n = al final).
  const [dropAt, setDropAt] = useState<number | null>(null);
  const canDrag = !busy && editingId === null && !adding;

  function handleDragOver(e: React.DragEvent<HTMLLIElement>, index: number) {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Mitad de arriba de la tarjeta = delante; mitad de abajo = detrás.
    const box = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < box.top + box.height / 2 ? index : index + 1;
    if (at !== dropAt) setDropAt(at);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (dragIndex !== null && dropAt !== null) reorder(dragIndex, dropAt);
    setDragIndex(null);
    setDropAt(null);
  }

  /** Línea de "caerá aquí", salvo donde soltar no movería nada. */
  const showDropLine = (at: number) =>
    dragIndex !== null && dropAt === at && at !== dragIndex && at !== dragIndex + 1;

  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? key;
  const deptNames = (keys: string[]) =>
    keys.map((k) => departments.find((d) => d.key === k)?.name ?? k).join(", ");

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <Link
          href={`/admin/protocolos/${tipo}`}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a {template?.name ?? "las fichas"}
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Plantilla: {template?.name ?? (loading ? "Cargando…" : "")}
        </h1>
        <p className="text-sm text-gray-500">
          Los cambios se aplican a las fichas que se creen a partir de ahora. Las
          fichas ya creadas no cambian.
        </p>
      </div>

      <AdminTabs active="/admin/protocolos" />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {template && (
        <div className="space-y-3">
          {steps.length > 1 && canDrag && (
            <p className="text-xs text-gray-400">
              Arrastra las tareas desde ⠿ para cambiarlas de orden, o usa las flechas.
            </p>
          )}
          <ol className="space-y-2" onDragLeave={(e) => {
            // Solo al salir de la lista entera, no al pasar de una tarjeta a otra.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
          }}>
            {steps.map((s, i) => (
              <li
                key={s.id}
                draggable={canDrag}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", s.id); // Firefox lo exige
                  setDragIndex(i);
                }}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={handleDrop}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropAt(null);
                }}
                className={`relative rounded-lg border bg-white p-4 shadow-sm transition-opacity ${
                  dragIndex === i ? "border-belsue opacity-40" : "border-gray-200"
                }`}
              >
                {showDropLine(i) && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-[6px] left-0 right-0 h-1 rounded-full bg-belsue"
                  />
                )}
                {i === steps.length - 1 && showDropLine(steps.length) && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-[6px] left-0 right-0 h-1 rounded-full bg-belsue"
                  />
                )}
                {editingId === s.id ? (
                  <StepForm
                    initial={draftFrom(s)}
                    roles={roles}
                    departments={departments}
                    asksDepartment={template.asks_department}
                    submitLabel="Guardar"
                    busy={busy}
                    onSubmit={(d) => saveStep(s.id, d)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      aria-hidden
                      title="Arrastrar para cambiar el orden"
                      className={`select-none self-center px-1 text-lg leading-none text-gray-400 ${
                        canDrag ? "cursor-grab hover:text-belsue active:cursor-grabbing" : "opacity-30"
                      }`}
                    >
                      ⠿
                    </span>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={busy || i === 0}
                        aria-label="Subir"
                        className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={busy || i === steps.length - 1}
                        aria-label="Bajar"
                        className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        <span className="mr-1 tabular-nums text-gray-400">{i + 1}.</span>
                        {s.text}
                      </p>
                      {s.help && <p className="mt-1 text-xs text-gray-500">{s.help}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded bg-belsue/10 px-2 py-0.5 font-medium text-belsue">
                          {roleName(s.default_role)}
                        </span>
                        {(s.condition?.departments?.length ?? 0) > 0 && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                            Solo: {deptNames(s.condition!.departments!)}
                          </span>
                        )}
                        {!s.allows_notes && (
                          <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                            Sin observaciones
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setEditingId(s.id);
                        }}
                        disabled={busy}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(s)}
                        disabled={busy}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {steps.length === 0 && (
            <p className="text-sm text-gray-500">Esta plantilla aún no tiene tareas.</p>
          )}

          {adding ? (
            <div className="rounded-lg border border-belsue/30 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">Nueva tarea</h2>
              <StepForm
                initial={{
                  text: "",
                  help: "",
                  default_role: "",
                  allows_notes: true,
                  departments: [],
                }}
                roles={roles}
                departments={departments}
                asksDepartment={template.asks_department}
                submitLabel="Añadir tarea"
                busy={busy}
                onSubmit={addStep}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setAdding(true);
              }}
              disabled={busy}
              className="rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
            >
              + Añadir tarea
            </button>
          )}
        </div>
      )}
    </div>
  );
}
