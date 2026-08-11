"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

// Debe coincidir con DOCUMENTS_BUCKET de lib/storage.ts.
const DOCUMENTS_BUCKET = "documentos";

// El PDF va primero a propósito: es el único que se lee dentro de la página.
// Los demás formatos se indexan igual para el agente, pero hay que descargarlos.
const ACCEPTED_EXT = [".pdf", ".pptx", ".docx", ".txt"];
const MAX_SIZE = 20 * 1024 * 1024;
const MAX_SIZE_PPTX = 50 * 1024 * 1024;

type Status = "idle" | "uploading" | "processing" | "error";

function getExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Añade una lección a un curso: sube el material y lo enlaza.
 *
 * El orden importa. La lección se crea ANTES de indexar el documento para que
 * la cabecera indexada ya nombre el curso y la lección; así el agente puede
 * responder citando "la lección 2 del curso X" sin reprocesar nada.
 */
export default function LessonForm({
  courseId,
  onAdded,
  onCancel,
}: {
  courseId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectFile(f: File | null) {
    if (!f) return;
    const ext = getExt(f.name);
    if (!ACCEPTED_EXT.includes(ext)) {
      setError("Formato no admitido. Sube PPTX, PDF, DOCX o TXT.");
      setFile(null);
      return;
    }
    const limit = ext === ".pptx" ? MAX_SIZE_PPTX : MAX_SIZE;
    if (f.size > limit) {
      setError(
        `El archivo supera ${Math.round(limit / 1024 / 1024)} MB. Comprime las imágenes o expórtalo a PDF.`,
      );
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    if (!title) setTitle(stripExtension(f.name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona el material de la lección.");
      return;
    }
    if (!title.trim()) {
      setError("La lección necesita un título.");
      return;
    }

    setError(null);
    setStatus("uploading");

    try {
      // 1. Registrar el documento y pedir URL firmada de subida.
      const urlRes = await fetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: title.trim(),
          ext: getExt(file.name),
          fileSize: file.size,
          description: description.trim() || undefined,
          category: "general",
          scope: "procedimientos",
        }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) {
        throw new Error(urlData.error ?? "No se pudo preparar la subida.");
      }
      const { documentId, path, token } = urlData as {
        documentId: string;
        path: string;
        token: string;
      };

      // 2. Subir el archivo directamente a Storage.
      const { error: upErr } = await supabaseBrowser()
        .storage.from(DOCUMENTS_BUCKET)
        .uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error(`Error al subir el archivo: ${upErr.message}`);

      // 3. Crear la lección (antes de indexar, ver comentario de arriba).
      const lessonRes = await fetch(`/api/courses/${courseId}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      const lessonData = await lessonRes.json();
      if (!lessonRes.ok) {
        throw new Error(lessonData.error ?? "No se pudo crear la lección.");
      }

      // 4. Indexar el material para que el agente pueda usarlo.
      setStatus("processing");
      const procRes = await fetch(`/api/documents/${documentId}/process`, {
        method: "POST",
      });
      const procData = await procRes.json().catch(() => ({}));
      if (!procRes.ok) {
        throw new Error(procData.error ?? "Error al indexar el material.");
      }

      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setStatus("error");
    }
  }

  const busy = status === "uploading" || status === "processing";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h2 className="font-semibold text-gray-800">Añadir lección</h2>

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
          if (!busy) selectFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver ? "border-belsue bg-belsue/5" : "border-gray-300 hover:border-belsue/50"
        } ${busy ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.docx,.txt"
          className="hidden"
          onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        {file ? (
          <div className="text-sm">
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-gray-400">{formatBytes(file.size)}</p>
            {getExt(file.name) !== ".pdf" && (
              <p className="mt-1 text-xs text-amber-600">
                Este formato hay que descargarlo para verlo. Si lo exportas a
                PDF, la lección se lee dentro de la propia página.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Arrastra el PDF aquí, o haz clic para elegirlo
            <span className="mt-1 block text-xs text-gray-400">
              También admite PPTX, DOCX y TXT, pero solo el PDF se lee dentro de
              la página (desde PowerPoint: Archivo → Exportar → PDF).
            </span>
          </p>
        )}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-600">
          Título de la lección <span className="text-belsue">*</span>
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={busy}
          placeholder="Ej: Cómo damos de alta una póliza"
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
          rows={2}
          disabled={busy}
          placeholder="Qué se explica en esta lección (ayuda al agente a encontrarla)"
          className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 focus:border-belsue focus:outline-none focus:ring-1 focus:ring-belsue"
        />
      </label>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {busy ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-belsue border-t-transparent" />
          {status === "uploading"
            ? "Subiendo el material…"
            : "Indexando para el agente… (puede tardar)"}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white hover:bg-belsue-700 disabled:opacity-40"
          >
            {status === "error" ? "Reintentar" : "Añadir lección"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}
