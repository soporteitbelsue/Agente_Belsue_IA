"use client";

import { SCOPE_LIST, sortScopes, type AgentScope } from "@/lib/scopes";

/**
 * Elige en qué portales se usa un documento o una nota. Se pueden marcar
 * varios: el mismo material puede servir en El Formador y en Procedimientos.
 *
 * Siempre queda al menos uno marcado (un documento sin portal no lo vería
 * nadie), así que desmarcar el último no hace nada.
 */
export default function ScopePicker({
  value,
  onChange,
  disabled = false,
  hint = "El material solo se usa para responder en los portales marcados.",
}: {
  value: AgentScope[];
  onChange: (next: AgentScope[]) => void;
  disabled?: boolean;
  hint?: string;
}) {
  function toggle(scope: AgentScope) {
    const next = value.includes(scope)
      ? value.filter((s) => s !== scope)
      : sortScopes([...value, scope]);
    if (next.length === 0) return;
    onChange(next);
  }

  return (
    <fieldset className="text-sm" disabled={disabled}>
      <legend className="mb-1 block font-medium text-gray-600">
        Portales <span className="text-belsue">*</span>
      </legend>
      <div className="space-y-1.5">
        {SCOPE_LIST.map((s) => {
          const checked = value.includes(s.id);
          const isLast = checked && value.length === 1;
          return (
            <label
              key={s.id}
              title={isLast ? "Tiene que quedar al menos un portal" : undefined}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition ${
                checked
                  ? "border-belsue/40 bg-belsue/5"
                  : "border-gray-300 hover:border-belsue/30"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(s.id)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 shrink-0 accent-belsue"
              />
              <span>
                <span className="block font-medium text-gray-700">
                  {s.title}
                </span>
                <span className="block text-xs text-gray-500">
                  {s.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-gray-400">{hint}</p>
    </fieldset>
  );
}
