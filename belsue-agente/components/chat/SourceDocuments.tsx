"use client";

import { useState } from "react";
import DocumentViewer from "@/components/DocumentViewer";
import { NO_ANSWER_RE } from "@/lib/noAnswer";
import type { Source } from "@/types";

/** Documentos como mucho bajo una respuesta cuando no cita ninguno por nombre. */
const FALLBACK_MAX = 3;

interface Doc {
  key: string;
  id?: string;
  name: string;
  company?: string;
  /** Página del fragmento más relevante: el PDF se abre ahí. */
  page?: number;
  /** Fragmentos del documento que vio el agente (para las notas, sin archivo). */
  fragments: string[];
}

/** Minúsculas, sin tildes, sin extensión y con _ - . como espacios. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(pdf|docx?|pptx?|xlsx?|txt|jpe?g|png)\b/g, "")
    .replace(/[_\-.'"“”‘’«»]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Documentos de los que sale la respuesta.
 *
 * El agente recibe hasta una docena de fragmentos, pero solo usa algunos, y el
 * prompt le obliga a citar por su nombre los documentos en los que se apoya.
 * Así que se muestran los que nombra. Si no nombra ninguno, los primeros por
 * relevancia; y si dice que no encuentra la información, ninguno: enseñar
 * documentos que no le sirvieron haría pensar que la respuesta sale de ellos.
 */
function documentsFor(sources: Source[], answer: string): Doc[] {
  const docs = new Map<string, Doc>();
  for (const s of sources) {
    const key = s.documentId ?? s.documentName;
    const doc = docs.get(key);
    if (doc) {
      doc.fragments.push(s.content);
      doc.page ??= s.page;
    } else {
      // Las fuentes vienen de más a menos relevantes: la primera página que
      // aparece es la del fragmento que más pesa.
      docs.set(key, {
        key,
        id: s.documentId,
        name: s.documentName,
        company: s.company,
        page: s.page,
        fragments: [s.content],
      });
    }
  }
  const all = [...docs.values()];

  const text = normalize(answer);
  const cited = all.filter((d) => {
    const name = normalize(d.name);
    return name.length >= 4 && text.includes(name);
  });
  if (cited.length > 0) return cited;
  if (NO_ANSWER_RE.test(answer)) return [];
  return all.slice(0, FALLBACK_MAX);
}

/** Qué hay abierto en el visor. */
type Viewing =
  | { doc: Doc; url: string; video: boolean }
  | { doc: Doc; text: string };

export default function SourceDocuments({
  sources,
  answer,
}: {
  sources: Source[];
  answer: string;
}) {
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const docs = documentsFor(sources, answer);
  if (docs.length === 0) return null;

  /** Lo que el agente leyó de ese documento, si no hay archivo que enseñar. */
  const showText = (doc: Doc) =>
    setViewing({ doc, text: doc.fragments.join("\n\n· · ·\n\n") });

  /**
   * Abre el documento: los PDF, imágenes y vídeos en el visor; los Word o
   * PowerPoint, que el navegador no sabe pintar, se descargan; y las notas,
   * que no tienen archivo, enseñan su texto.
   */
  async function open(doc: Doc) {
    setError(null);
    if (!doc.id) return showText(doc);
    setLoadingKey(doc.key);
    try {
      const res = await fetch(`/api/documents/${doc.id}/view`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const video = data.video === true;
        // El visor de PDF del navegador entiende #page=N y abre ahí.
        const url =
          !video && doc.page ? `${data.url as string}#page=${doc.page}` : (data.url as string);
        setViewing({ doc, url, video });
        return;
      }
      const dl = await fetch(`/api/documents/${doc.id}/download`);
      const dlData = await dl.json().catch(() => ({}));
      if (dl.ok && dlData.url) {
        window.open(dlData.url as string, "_blank");
        return;
      }
      showText(doc);
    } catch {
      setError("No se pudo abrir el documento.");
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <>
      <div className="mt-1.5 flex max-w-full flex-col gap-1.5">
        <p className="px-1 text-[12px] font-medium text-ios-secondary">
          {docs.length === 1 ? "Documento consultado" : "Documentos consultados"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {docs.map((doc) => (
            <button
              key={doc.key}
              type="button"
              onClick={() => open(doc)}
              disabled={loadingKey === doc.key}
              title="Abrir el documento"
              className="inline-flex max-w-full items-center gap-2 rounded-xl border border-ios-border bg-ios-surface px-3 py-2 text-left text-[14px] text-ios-label shadow-ios transition-colors duration-150 hover:bg-ios-surface-hover disabled:opacity-60"
            >
              <svg className="h-4 w-4 shrink-0 text-ios-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="min-w-0 truncate">
                {doc.name}
                {doc.company && (
                  <span className="text-ios-secondary"> · {doc.company}</span>
                )}
                {doc.page && (
                  <span className="text-ios-secondary"> · pág. {doc.page}</span>
                )}
              </span>
              <span className="shrink-0 text-[13px] font-medium text-ios-accent">
                {loadingKey === doc.key ? "Abriendo…" : "Ver"}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="px-1 text-[12px] text-red-600">{error}</p>}
      </div>

      {viewing && (
        <DocumentViewer
          title={viewing.doc.name}
          subtitle={
            [viewing.doc.company, viewing.doc.page && `página ${viewing.doc.page}`]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          {...("url" in viewing
            ? { url: viewing.url, video: viewing.video }
            : { text: viewing.text })}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
