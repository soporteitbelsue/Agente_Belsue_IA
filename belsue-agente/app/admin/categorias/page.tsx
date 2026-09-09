"use client";

import { useCallback, useEffect, useState } from "react";
import AdminTabs from "@/components/admin/AdminTabs";
import { useCategoriesRefresh } from "@/components/CategoriesProvider";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  EMPTY_CATEGORIES,
  RESERVED_CATEGORY_VALUES,
  categoryBadge,
  slugifyCategory,
  type CategoriesByScope,
  type Category,
} from "@/lib/categories";
import { SCOPE_LIST, type AgentScope } from "@/lib/scopes";

const COLOR_OPTIONS = Object.entries(CATEGORY_COLORS).map(([key, color]) => ({
  key,
  ...color,
}));

/** Paleta cerrada: se elige un color de los que sabe pintar la aplicación. */
function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {COLOR_OPTIONS.map(({ key, label, badge }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          disabled={disabled}
          title={label}
          aria-label={label}
          aria-pressed={value === key}
          className={`h-6 w-6 rounded ${badge} ${
            value === key
              ? "ring-2 ring-belsue ring-offset-1"
              : "opacity-70 hover:opacity-100"
          } disabled:opacity-40`}
        />
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const refreshApp = useCategoriesRefresh();

  const [categories, setCategories] =
    useState<CategoriesByScope>(EMPTY_CATEGORIES);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulario de creación, uno por portal.
  const [newLabel, setNewLabel] = useState<Record<string, string>>({});
  const [newColor, setNewColor] = useState<Record<string, string>>({});

  // Fila que se está editando.
  const [editing, setEditing] = useState<{
    id: string;
    label: string;
    color: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/categories?usage=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar.");
      setCategories(data.categories as CategoriesByScope);
      setUsage((data.usage ?? {}) as Record<string, number>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Todo cambio recarga esta pantalla y avisa al resto de la aplicación. */
  const afterChange = useCallback(async () => {
    await load();
    await refreshApp();
  }, [load, refreshApp]);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
      await afterChange();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(scope: AgentScope) {
    const label = (newLabel[scope] ?? "").trim();
    if (!label) return;
    const ok = await send("/api/categories", "POST", {
      scope,
      label,
      color: newColor[scope] ?? DEFAULT_CATEGORY_COLOR,
    });
    if (ok) {
      setNewLabel((p) => ({ ...p, [scope]: "" }));
      setNewColor((p) => ({ ...p, [scope]: DEFAULT_CATEGORY_COLOR }));
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const ok = await send(`/api/categories/${editing.id}`, "PATCH", {
      label: editing.label.trim(),
      color: editing.color,
    });
    if (ok) setEditing(null);
  }

  /**
   * Mover una fila manda el orden COMPLETO del portal, no "sube una": así dos
   * pulsaciones seguidas no se pisan ni dejan dos categorías en la misma
   * posición.
   */
  async function move(scope: AgentScope, index: number, delta: number) {
    const list = [...categories[scope]];
    const target = index + delta;
    const moved = list[index];
    const displaced = list[target];
    if (!moved || !displaced) return;
    list[index] = displaced;
    list[target] = moved;
    await send("/api/categories", "PATCH", {
      scope,
      ids: list.map((c) => c.id),
    });
  }

  async function remove(category: Category) {
    const uses = usage[category.value] ?? 0;
    const aviso =
      uses > 0
        ? `"${category.label}" tiene ${uses} documento(s) dentro, así que no se va a poder borrar.`
        : `¿Borrar la categoría "${category.label}"?`;
    if (!confirm(aviso)) return;
    await send(`/api/categories/${category.id}`, "DELETE");
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Categorías</h1>
        <p className="mt-1 text-sm text-gray-500">
          Con qué etiquetas se cataloga el material de cada portal. Lo que
          añadas aquí sale al momento en los formularios y en los filtros, y el
          agente lo usa para enumerar lo que hay.
        </p>
      </div>

      <AdminTabs active="/admin/categorias" />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Cargando…</p>}

      {!loading &&
        SCOPE_LIST.map((scope) => {
          const list = categories[scope.id];
          return (
            <section
              key={scope.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-gray-800">
                {scope.title}
              </h2>
              <p className="mb-4 text-sm text-gray-500">{scope.description}</p>

              <ul className="divide-y divide-gray-100">
                {list.map((category, index) => {
                  const uses = usage[category.value] ?? 0;
                  const reserved = RESERVED_CATEGORY_VALUES.includes(
                    category.value,
                  );
                  const isEditing = editing?.id === category.id;

                  return (
                    <li key={category.id} className="py-3">
                      {isEditing ? (
                        <div className="space-y-3">
                          <input
                            value={editing.label}
                            onChange={(e) =>
                              setEditing({ ...editing, label: e.target.value })
                            }
                            disabled={busy}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none sm:max-w-sm"
                          />
                          <ColorPicker
                            value={editing.color}
                            onChange={(color) =>
                              setEditing({ ...editing, color })
                            }
                            disabled={busy}
                          />
                          <p className="text-xs text-gray-400">
                            Cambia solo cómo se lee. Por dentro sigue siendo{" "}
                            <code className="rounded bg-gray-100 px-1">
                              {category.value}
                            </code>
                            , que es lo que hay grabado en cada documento.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              disabled={busy || !editing.label.trim()}
                              className="rounded-lg bg-belsue px-3 py-1.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
                            >
                              {busy ? "Guardando…" : "Guardar"}
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              disabled={busy}
                              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${categoryBadge(
                              category.color,
                            )}`}
                          >
                            {category.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {uses === 0
                              ? "sin documentos"
                              : `${uses} ${uses === 1 ? "documento" : "documentos"}`}
                          </span>

                          <span className="ml-auto flex items-center gap-3 text-sm">
                            <span className="flex gap-1">
                              <button
                                onClick={() => move(scope.id, index, -1)}
                                disabled={busy || index === 0}
                                aria-label="Subir"
                                className="rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => move(scope.id, index, 1)}
                                disabled={busy || index === list.length - 1}
                                aria-label="Bajar"
                                className="rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                              >
                                ↓
                              </button>
                            </span>
                            <button
                              onClick={() =>
                                setEditing({
                                  id: category.id,
                                  label: category.label,
                                  color: category.color,
                                })
                              }
                              disabled={busy}
                              className="font-medium text-gray-500 hover:text-belsue hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => remove(category)}
                              disabled={busy || reserved || uses > 0}
                              title={
                                reserved
                                  ? "La usa la aplicación por dentro"
                                  : uses > 0
                                    ? "Tiene documentos dentro"
                                    : undefined
                              }
                              className="font-medium text-gray-400 hover:text-red-600 hover:underline disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:no-underline"
                            >
                              Borrar
                            </button>
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {list.length === 0 && (
                <p className="py-3 text-sm text-gray-400">
                  Este portal no tiene categorías. ¿Se ha aplicado la migración
                  014?
                </p>
              )}

              <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-600">
                    Nueva categoría
                  </span>
                  <input
                    value={newLabel[scope.id] ?? ""}
                    onChange={(e) =>
                      setNewLabel((p) => ({ ...p, [scope.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        create(scope.id);
                      }
                    }}
                    disabled={busy}
                    placeholder={
                      scope.id === "seguros"
                        ? "Ej: Furgonetas"
                        : "Ej: Renovaciones"
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none sm:max-w-sm"
                  />
                </label>

                <ColorPicker
                  value={newColor[scope.id] ?? DEFAULT_CATEGORY_COLOR}
                  onChange={(color) =>
                    setNewColor((p) => ({ ...p, [scope.id]: color }))
                  }
                  disabled={busy}
                />

                {(newLabel[scope.id] ?? "").trim() && (
                  <p className="text-xs text-gray-400">
                    Se guardará como{" "}
                    <code className="rounded bg-gray-100 px-1">
                      {slugifyCategory(newLabel[scope.id] ?? "") || "—"}
                    </code>
                    , y ese valor ya no cambia.
                  </p>
                )}

                <button
                  onClick={() => create(scope.id)}
                  disabled={busy || !(newLabel[scope.id] ?? "").trim()}
                  className="rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
                >
                  {busy ? "Guardando…" : "Añadir categoría"}
                </button>
              </div>
            </section>
          );
        })}
    </div>
  );
}
