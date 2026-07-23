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

export interface EditableDocument {
  id: string;
  name: string;
  description: string | null;
  company: string | null;
  category: string | null;
}

type Status = "idle" | "saving" | "success" | "error";

/**
 * Formulario para editar los metadatos de un documento (sin tocar el archivo).
 * Al guardar, el servidor regenera la cabecera indexada (con la descripción).
 */
export default function DocumentMetaForm({
  doc,
  onSaved,
}: {
  doc: EditableDocument;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(doc.name);
  const [description, setDescription] = useState(doc.description ?? "");
  const [company, setCompany] = useState(doc.company ?? "");
  const [category, setCategory] = useState(doc.category ?? "general");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          company: company.trim() || null,
          category,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Error al guardar.");
      setStatus("success");
      window.dispatchEvent(new CustomEvent("document-uploaded"));
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setStatus("error");
    }
  }

  const busy = status === "saving";

  if (status === "success") {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="font-medium text-gray-800">Documento actualizado</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Editar documento</h2>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">
          Nombre <span className="text-belsue">*</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={busy}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">
          Descripción
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={busy}
          placeholder="Para qué sirve y cuándo usarlo (el agente lo usa para encontrarlo)"
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
            placeholder="Ej: Mapfre, Allianz…"
            disabled={busy}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-600">Categoría</span>
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

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40 sm:w-auto"
      >
        {busy ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
