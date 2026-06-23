"use client";

import { useEffect, useRef, useState } from "react";

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

const ACCEPTED_EXT = [".pdf", ".docx", ".txt"];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

type Status = "idle" | "uploading" | "processing" | "success" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [company, setCompany] = useState("");
  const [category, setCategory] = useState("general");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function validateFile(f: File): string | null {
    const lower = f.name.toLowerCase();
    const okExt = ACCEPTED_EXT.some((ext) => lower.endsWith(ext));
    if (!okExt) {
      return "Tipo de archivo no permitido. Solo PDF, DOCX o TXT.";
    }
    if (f.size > MAX_SIZE) {
      return "El archivo supera el tamaño máximo de 20 MB.";
    }
    return null;
  }

  function selectFile(f: File | null) {
    if (!f) return;
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    if (!name) setName(stripExtension(f.name));
  }

  function resetForm() {
    setFile(null);
    setName("");
    setDescription("");
    setCompany("");
    setCategory("general");
    setStatus("idle");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pollStatus(documentId: string) {
    setStatus("processing");
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/status`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al consultar estado.");

        if (data.status === "ready") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus("success");
          window.dispatchEvent(new CustomEvent("document-uploaded"));
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setError(err instanceof Error ? err.message : "Error al procesar.");
        setStatus("error");
      }
    }, 3000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona un archivo.");
      return;
    }
    if (!name.trim()) {
      setError("El nombre del documento es obligatorio.");
      return;
    }

    setError(null);
    setStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());
    if (description) formData.append("description", description);
    if (company) formData.append("company", company);
    formData.append("category", category);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Error al subir el documento.");
      }
      // Notifica a la lista para que muestre el doc "Procesando…".
      window.dispatchEvent(new CustomEvent("document-uploaded"));
      pollStatus(data.documentId as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setStatus("error");
    }
  }

  const busy = status === "uploading" || status === "processing";

  // --- Vista de éxito ---
  if (status === "success") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
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
          Documento procesado correctamente
        </p>
        <button
          onClick={resetForm}
          className="mt-4 rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white hover:bg-belsue-700"
        >
          Subir otro
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-gray-800">Subir documento</h2>

      {/* Drag & drop */}
      <div
        onClick={() => !busy && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy) return;
          selectFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
          dragOver
            ? "border-belsue bg-belsue/5"
            : "border-gray-300 hover:border-belsue/50"
        } ${busy ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        {file ? (
          <div className="text-sm">
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-gray-400">{formatBytes(file.size)}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Arrastra el documento aquí o haz clic para seleccionar
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-gray-600">
            Nombre del documento <span className="text-belsue">*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={busy}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
          />
        </label>

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

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-gray-600">
            Descripción
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={busy}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
          />
        </label>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          <span>{error}</span>
        </div>
      )}

      {busy ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-belsue border-t-transparent" />
          {status === "uploading"
            ? "Subiendo archivo..."
            : "Procesando documento y generando embeddings... (puede tardar)"}
        </div>
      ) : (
        <button
          type="submit"
          className="w-full rounded-lg bg-belsue px-4 py-2.5 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40 sm:w-auto"
        >
          {status === "error" ? "Reintentar" : "Subir documento"}
        </button>
      )}
    </form>
  );
}
