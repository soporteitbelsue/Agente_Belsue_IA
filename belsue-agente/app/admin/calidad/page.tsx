"use client";

import { useCallback, useEffect, useState } from "react";
import AdminTabs from "@/components/admin/AdminTabs";
import PdfReindexer from "@/components/admin/PdfReindexer";
import type { EvalReport, QuestionResult } from "@/lib/evaluation";
import type { SearchMode } from "@/lib/retrieval";

const MODE_LABEL: Record<SearchMode, string> = {
  vector: "Antes (solo significado)",
  hybrid: "Híbrida (significado + palabras)",
  rerank: "Híbrida + reordenación (la del chat)",
};

interface QuestionRow {
  id: string;
  question: string;
  esperado: string;
  origen: string;
}

function Position({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="font-semibold text-red-600">✗</span>;
  }
  return (
    <span className={value === 1 ? "font-semibold text-green-700" : "text-gray-700"}>
      {value}º
    </span>
  );
}

export default function QualityPage() {
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [busy, setBusy] = useState<null | "generar" | "evaluar" | "vaciar">(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyFailures, setOnlyFailures] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/eval");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar.");
      setQuestions(data.preguntas ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(accion: "generar" | "evaluar" | "vaciar") {
    if (accion === "vaciar" && !window.confirm("¿Borrar todas las preguntas de prueba?")) {
      return;
    }
    setBusy(accion);
    setError(null);
    try {
      const res = await fetch("/api/admin/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accion === "generar" ? { accion, cantidad: 30 } : { accion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ha fallado.");
      if (accion === "evaluar") setReport(data as EvalReport);
      if (accion === "vaciar") setReport(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ha fallado.");
    } finally {
      setBusy(null);
    }
  }

  const rows: QuestionResult[] = report
    ? onlyFailures
      ? report.resultados.filter((r) => r.posiciones.rerank !== 1)
      : report.resultados
    : [];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Calidad de las respuestas</h1>
        <p className="max-w-3xl text-sm text-gray-500">
          Mide si al agente le llega el documento que responde a cada pregunta.
          Casi siempre que responde mal es porque no le llegó. Las preguntas de
          prueba se escriben a partir de fragmentos reales de los documentos, así
          que se sabe cuál es el documento correcto.
        </p>
      </div>

      <AdminTabs active="/admin/calidad" />

      <PdfReindexer />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => act("generar")}
          disabled={busy !== null}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "generar" ? "Generando… (1-2 min)" : "Añadir 30 preguntas de prueba"}
        </button>
        <button
          onClick={() => act("evaluar")}
          disabled={busy !== null || questions.length === 0}
          className="rounded-md bg-belsue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {busy === "evaluar" ? "Evaluando… (puede tardar unos minutos)" : "Evaluar la búsqueda"}
        </button>
        <span className="text-sm text-gray-500">
          {questions.length} {questions.length === 1 ? "pregunta" : "preguntas"} en la batería
        </span>
        {questions.length > 0 && (
          <button
            onClick={() => act("vaciar")}
            disabled={busy !== null}
            className="ml-auto text-sm text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            Vaciar batería
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {report.resumen.map((s) => (
              <div
                key={s.mode}
                className={`rounded-lg border bg-white p-4 shadow-sm ${
                  s.mode === "rerank" ? "border-belsue/50" : "border-gray-200"
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {MODE_LABEL[s.mode]}
                </p>
                <p className="mt-1 text-3xl font-bold text-belsue">{s.aciertos}%</p>
                <p className="text-sm text-gray-500">
                  encuentra el documento · posición media {s.mrr} · {(s.msMedio / 1000).toFixed(1)} s
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            «Posición media» va de 0 a 1: 1 significa que el documento correcto sale
            siempre el primero. Sobre {report.preguntas} preguntas.
          </p>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-700">Detalle por pregunta</h2>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={onlyFailures}
                  onChange={(e) => setOnlyFailures(e.target.checked)}
                />
                Solo donde el correcto no sale el primero
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Pregunta</th>
                    <th className="px-4 py-2">Documento correcto</th>
                    <th className="px-3 py-2 text-center">Antes</th>
                    <th className="px-3 py-2 text-center">Híbrida</th>
                    <th className="px-3 py-2 text-center">+ Reorden.</th>
                    <th className="px-4 py-2">Lo que recibió el agente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-4 py-2 text-gray-800">{r.question}</td>
                      <td className="px-4 py-2 text-gray-600">{r.esperado}</td>
                      <td className="px-3 py-2 text-center"><Position value={r.posiciones.vector} /></td>
                      <td className="px-3 py-2 text-center"><Position value={r.posiciones.hybrid} /></td>
                      <td className="px-3 py-2 text-center"><Position value={r.posiciones.rerank} /></td>
                      <td className="px-4 py-2 text-xs text-gray-500">{r.obtenidos.join(" · ")}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                        En todas sale el documento correcto el primero.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!report && questions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">
            Batería de preguntas
          </h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {questions.map((q) => (
              <li key={q.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="text-gray-800">{q.question}</span>
                <span className="text-gray-500">{q.esperado}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
