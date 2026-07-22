"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "auto", label: "Auto" },
  { value: "moto", label: "Moto" },
  { value: "hogar", label: "Hogar" },
  { value: "vida", label: "Vida" },
  { value: "salud", label: "Salud" },
  { value: "decesos", label: "Decesos" },
  { value: "viaje", label: "Asistencia en viaje" },
  { value: "rc", label: "Responsabilidad Civil" },
];

type Status = "idle" | "saving" | "success" | "error";

export interface EditableNote {
  id: string;
  name: string;
  content: string | null;
  company: string | null;
  category: string | null;
}

/**
 * Formulario para crear o editar una nota de conocimiento.
 * - `embedded`: sin tarjeta propia (para usarlo dentro de un modal).
 * - `onSaved`: callback tras guardar con éxito (además del mensaje de éxito).
 * - `note`: si se pasa, el formulario entra en modo edición (PATCH).
 */
export default function NoteForm({
  embedded = false,
  onSaved,
  note,
}: {
  embedded?: boolean;
  onSaved?: () => void;
  note?: EditableNote;
} = {}) {
  const isEdit = !!note;
  const [name, setName] = useState(note?.name ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [company, setCompany] = useState(note?.company ?? "");
  const [category, setCategory] = useState(note?.category ?? "general");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setContent("");
    setCompany("");
    setCategory("general");
    setStatus("idle");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    if (content.trim().length < 10) {
      setError("Escribe algo más de contenido en la nota.");
      return;
    }

    setError(null);
    setStatus("saving");

    try {
      const res = await fetch(
        isEdit ? `/api/documents/note/${note!.id}` : "/api/documents/note",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            content: content.trim(),
            company: company.trim() || (isEdit ? null : undefined),
            category,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || (!isEdit && !data.success)) {
        throw new Error(data.error ?? "Error al guardar la nota.");
      }
      setStatus("success");
      window.dispatchEvent(new CustomEvent("document-uploaded"));
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setStatus("error");
    }
  }

  const busy = status === "saving";

  const cardClass = embedded
    ? "text-center"
    : "rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm";
  const formClass = embedded
    ? "space-y-4"
    : "space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm";

  // --- Vista de éxito ---
  if (status === "success") {
    return (
      <div className={cardClass}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>
        <p className="font-medium text-gray-800">
          {isEdit
            ? "Nota actualizada e indexada correctamente"
            : "Nota guardada e indexada correctamente"}
        </p>
        {!isEdit && (
          <button
            onClick={resetForm}
            className="mt-4 rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white hover:bg-belsue-700"
          >
            Añadir otra
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={formClass}>
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          {isEdit ? "Editar nota" : "Añadir conocimiento (nota)"}
        </h2>
        <p className="text-sm text-gray-500">
          Escribe una regla o recomendación (p. ej. &ldquo;Para cotizar auto con
          conductor novel, mejor en tal compañía&rdquo;). El agente la usará como
          una fuente más, sin necesidad de subir un documento.
        </p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">
          Título <span className="text-belsue">*</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={busy}
          placeholder="Ej: Cotización auto conductor novel"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">
          Contenido de la nota <span className="text-belsue">*</span>
        </span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={5}
          disabled={busy}
          placeholder="Escribe aquí la información, regla o recomendación…"
          className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-600">
            Compañía aseguradora
          </span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Ej: Mapfre, Allianz, AXA, Generali..."
            disabled={busy}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-600">
            Categoría <span className="text-belsue">*</span>
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {busy ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-belsue border-t-transparent" />
          Guardando y generando embeddings…
        </div>
      ) : (
        <button
          type="submit"
          className="w-full rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40 sm:w-auto"
        >
          {status === "error"
            ? "Reintentar"
            : isEdit
              ? "Guardar cambios"
              : "Guardar nota"}
        </button>
      )}
    </form>
  );
}
