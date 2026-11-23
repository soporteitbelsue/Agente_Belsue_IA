"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminTabs from "@/components/admin/AdminTabs";
import type { KeyName, ProtocolTemplateStep } from "@/types";

/**
 * Editor de plantilla en BORRADOR: editar, añadir, quitar y reordenar solo
 * cambian lo que se ve en pantalla. Nada se graba hasta pulsar "Guardar
 * cambios", que manda la plantilla entera y la base la aplica de una vez
 * (todo o nada). "Descartar" vuelve a lo guardado.
 */

interface TemplateInfo {
  key: string;
  name: string;
  description: string | null;
  asks_department: boolean;
}

interface DraftStep {
  /** Clave de pantalla: el id real o uno temporal para las nuevas. */
  uid: string;
  /** null = todavía no existe en la base. */
  id: string | null;
  text: string;
  help: string;
  default_role: string;
  allows_notes: boolean;
  departments: string[];
  companies: boolean;
}

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue";

function toDraft(step: ProtocolTemplateStep): DraftStep {
  return {
    uid: step.id,
    id: step.id,
    text: step.text,
    help: step.help ?? "",
    default_role: step.default_role,
    allows_notes: step.allows_notes,
    departments: step.condition?.departments ?? [],
    companies: step.subitems === "companias",
  };
}

/** Comparación para saber si hay cambios sin guardar (sin el uid de pantalla). */
function fingerprint(steps: DraftStep[]): string {
  return JSON.stringify(
    steps.map((s) => [
      s.id,
      s.text.trim(),
      s.help.trim(),
      s.default_role,
      s.allows_notes,
      [...s.departments].sort(),
      s.companies,
    ]),
  );
}

let tmpCounter = 0;
const newUid = () => `nueva-${Date.now()}-${tmpCounter++}`;

/** Campos de una tarea, enlazados directamente al borrador. */
function StepFields({
  step,
  roles,
  departments,
  asksDepartment,
  onChange,
}: {
  step: DraftStep;
  roles: KeyName[];
  departments: KeyName[];
  asksDepartment: boolean;
  onChange: (patch: Partial<DraftStep>) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">Tarea</span>
        <input
          value={step.text}
          onChange={(e) => onChange({ text: e.target.value })}
          autoFocus
          maxLength={500}
          className={`${inputCls} ${step.text.trim() ? "" : "border-red-200"}`}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">Ayuda (opcional)</span>
        <input
          value={step.help}
          onChange={(e) => onChange({ help: e.target.value })}
          maxLength={1000}
          placeholder="Explicación que se ve debajo de la tarea"
          className={inputCls}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-600">Responsable por defecto</span>
          <select
            value={step.default_role}
            onChange={(e) => onChange({ default_role: e.target.value })}
            className={`${inputCls} ${step.default_role ? "" : "border-red-200"}`}
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
            checked={step.allows_notes}
            onChange={(e) => onChange({ allows_notes: e.target.checked })}
            className="h-4 w-4 accent-belsue"
          />
          Admite observaciones
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={step.companies}
          onChange={(e) => onChange({ companies: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-belsue"
        />
        <span>
          Lleva la lista de compañías
          <span className="block text-xs text-gray-400">
            Un check por compañía (de Protocolos → Compañías). Con todas marcadas, la
            tarea se marca sola.
          </span>
        </span>
      </label>

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
                  checked={step.departments.includes(dep.key)}
                  onChange={(e) =>
                    onChange({
                      departments: e.target.checked
                        ? [...step.departments, dep.key]
                        : step.departments.filter((k) => k !== dep.key),
                    })
                  }
                  className="h-4 w-4 accent-belsue"
                />
                {dep.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export default function TemplateEditorPage() {
  const { tipo } = useParams<{ tipo: string }>();
  const router = useRouter();

  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [saved, setSaved] = useState<DraftStep[]>([]);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [roles, setRoles] = useState<KeyName[]>([]);
  const [departments, setDepartments] = useState<KeyName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [openUid, setOpenUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/protocolos/plantillas/${tipo}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar la plantilla.");
      const drafts = (data.steps as ProtocolTemplateStep[]).map(toDraft);
      setTemplate(data.template);
      setSaved(drafts);
      setSteps(drafts);
      setRoles(data.roles);
      setDepartments(data.departments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la plantilla.");
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => fingerprint(steps) !== fingerprint(saved), [steps, saved]);
  const removedCount = saved.filter((s) => !steps.some((d) => d.id === s.id)).length;

  // Aviso del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (dirty) setJustSaved(false);
  }, [dirty]);

  // --- Cambios en el borrador (nada se graba aquí) ---
  function patchStep(uid: string, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  }

  function addStep() {
    const uid = newUid();
    setSteps((prev) => [
      ...prev,
      {
        uid,
        id: null,
        text: "",
        help: "",
        default_role: "",
        allows_notes: true,
        departments: [],
        companies: false,
      },
    ]);
    setOpenUid(uid);
  }

  function removeStep(uid: string) {
    setSteps((prev) => prev.filter((s) => s.uid !== uid));
    if (openUid === uid) setOpenUid(null);
  }

  /** Mueve la tarea de `from` delante de la que ocupa `insertAt` (0..n). */
  function reorder(from: number, insertAt: number) {
    const to = insertAt > from ? insertAt - 1 : insertAt;
    if (to === from || to < 0 || to >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const moved = next.splice(from, 1);
      next.splice(to, 0, ...moved);
      return next;
    });
  }

  const move = (index: number, delta: -1 | 1) =>
    reorder(index, delta === -1 ? index - 1 : index + 2);

  // --- Guardar / descartar ---
  async function save() {
    const bad = steps.findIndex((s) => !s.text.trim() || !s.default_role);
    if (bad !== -1) {
      setOpenUid(steps[bad]!.uid);
      setError(`A la tarea ${bad + 1} le falta el texto o el responsable.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/protocolos/plantillas/${tipo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: steps.map((s) => ({
            id: s.id,
            text: s.text.trim(),
            help: s.help.trim() || null,
            default_role: s.default_role,
            allows_notes: s.allows_notes,
            departments: template?.asks_department ? s.departments : [],
            subitems: s.companies ? "companias" : null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se ha podido guardar.");
      setOpenUid(null);
      await load();
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se ha podido guardar.");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!window.confirm("¿Descartar los cambios sin guardar?")) return;
    setSteps(saved);
    setOpenUid(null);
    setError(null);
  }

  function goBack(e: React.MouseEvent) {
    if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Salir sin guardarlos?")) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    router.push(`/admin/protocolos/${tipo}`);
  }

  // --- Arrastrar y soltar (nativo del navegador) ---
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const canDrag = !saving && openUid === null;

  function handleDragOver(e: React.DragEvent<HTMLLIElement>, index: number) {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const box = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < box.top + box.height / 2 ? index : index + 1;
    if (at !== dropAt) setDropAt(at);
  }

  function finishDrag(e?: React.DragEvent) {
    e?.preventDefault();
    if (dragIndex !== null && dropAt !== null) reorder(dragIndex, dropAt);
    setDragIndex(null);
    setDropAt(null);
  }

  const showDropLine = (at: number) =>
    dragIndex !== null && dropAt === at && at !== dragIndex && at !== dragIndex + 1;

  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? "Sin responsable";
  const deptNames = (keys: string[]) =>
    keys.map((k) => departments.find((d) => d.key === k)?.name ?? k).join(", ");
  const savedById = useMemo(() => new Map(saved.map((s) => [s.id, s])), [saved]);
  const isChanged = (s: DraftStep) => {
    const orig = s.id ? savedById.get(s.id) : undefined;
    return !orig || fingerprint([{ ...s }]) !== fingerprint([{ ...orig }]);
  };

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 pb-28 pt-6 sm:px-6">
      <div>
        <Link
          href={`/admin/protocolos/${tipo}`}
          onClick={goBack}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a {template?.name ?? "las fichas"}
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Plantilla: {template?.name ?? (loading ? "Cargando…" : "")}
        </h1>
        <p className="text-sm text-gray-500">
          Haz los cambios que quieras y pulsa <b>Guardar cambios</b> al final. Se aplican a
          las fichas que se creen a partir de ahora; las ya creadas no cambian.
        </p>
      </div>

      <AdminTabs active="/admin/protocolos" />

      {template && (
        <div className="space-y-3">
          {steps.length > 1 && canDrag && (
            <p className="text-xs text-gray-400">
              Arrastra las tareas desde ⠿ para cambiarlas de orden, o usa las flechas.
            </p>
          )}

          <ol
            className="space-y-2"
            // Soltar en el hueco entre dos tarjetas también cuenta.
            onDragOver={(e) => dragIndex !== null && e.preventDefault()}
            onDrop={finishDrag}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
            }}
          >
            {steps.map((s, i) => {
              const open = openUid === s.uid;
              const changed = isChanged(s);
              return (
                <li
                  key={s.uid}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", s.uid); // Firefox lo exige
                    setDragIndex(i);
                  }}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropAt(null);
                  }}
                  className={`relative rounded-lg border bg-white p-4 shadow-sm transition-opacity ${
                    dragIndex === i
                      ? "border-belsue opacity-40"
                      : changed
                        ? "border-amber-300"
                        : "border-gray-200"
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

                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      aria-hidden
                      title="Arrastrar para cambiar el orden"
                      className={`select-none self-center px-1 text-lg leading-none text-gray-400 ${
                        canDrag
                          ? "cursor-grab hover:text-belsue active:cursor-grabbing"
                          : "opacity-30"
                      }`}
                    >
                      ⠿
                    </span>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={saving || i === 0}
                        aria-label="Subir"
                        className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={saving || i === steps.length - 1}
                        aria-label="Bajar"
                        className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        <span className="mr-1 tabular-nums text-gray-400">{i + 1}.</span>
                        {s.text.trim() || <span className="italic text-gray-400">Tarea sin texto</span>}
                        {!s.id ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[11px] font-medium text-amber-700">
                            Nueva · sin guardar
                          </span>
                        ) : (
                          changed && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[11px] font-medium text-amber-700">
                              Modificada · sin guardar
                            </span>
                          )
                        )}
                      </p>
                      {!open && (
                        <>
                          {s.help.trim() && (
                            <p className="mt-1 text-xs text-gray-500">{s.help}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                            <span className="rounded bg-belsue/10 px-2 py-0.5 font-medium text-belsue">
                              {roleName(s.default_role)}
                            </span>
                            {template.asks_department && s.departments.length > 0 && (
                              <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                                Solo: {deptNames(s.departments)}
                              </span>
                            )}
                            {!s.allows_notes && (
                              <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                                Sin observaciones
                              </span>
                            )}
                            {s.companies && (
                              <span className="rounded bg-sky-100 px-2 py-0.5 font-medium text-sky-700">
                                Lista de compañías
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenUid(open ? null : s.uid)}
                        disabled={saving}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                          open
                            ? "border-belsue bg-belsue/10 text-belsue"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {open ? "Cerrar" : "Editar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(s.uid)}
                        disabled={saving}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <StepFields
                        step={s}
                        roles={roles}
                        departments={departments}
                        asksDepartment={template.asks_department}
                        onChange={(patch) => patchStep(s.uid, patch)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {steps.length === 0 && (
            <p className="text-sm text-gray-500">Esta plantilla no tiene tareas.</p>
          )}

          <button
            type="button"
            onClick={addStep}
            disabled={saving}
            className="rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-belsue hover:border-belsue hover:bg-belsue/5 disabled:opacity-40"
          >
            + Añadir tarea
          </button>
        </div>
      )}

      {/* Barra de guardado, siempre a la vista abajo */}
      {template && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1 text-sm">
              {error ? (
                <span className="font-medium text-red-600">{error}</span>
              ) : dirty ? (
                <span className="font-medium text-amber-700">
                  Tienes cambios sin guardar
                  {removedCount > 0 &&
                    ` (${removedCount} tarea${removedCount === 1 ? "" : "s"} quitada${
                      removedCount === 1 ? "" : "s"
                    })`}
                  .
                </span>
              ) : justSaved ? (
                <span className="font-medium text-green-700">✓ Cambios guardados.</span>
              ) : (
                <span className="text-gray-500">Sin cambios.</span>
              )}
            </div>
            <button
              type="button"
              onClick={discard}
              disabled={!dirty || saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-lg bg-belsue px-5 py-2 text-sm font-semibold text-white hover:bg-belsue-700 disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
