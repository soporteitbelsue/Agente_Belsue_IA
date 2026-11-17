"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Pending {
  id: string;
  name: string;
}

interface Status {
  total: number;
  sinArchivo: number;
  pendientes: Pending[];
}

interface LogLine {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Relee los PDF ya subidos con el lector nuevo (páginas, tablas, escaneados).
 *
 * Va de uno en uno desde el navegador: cada PDF puede tardar un minuto, y así
 * se ve el progreso, se puede parar cuando se quiera y retomar después (los
 * que ya están hechos no vuelven a salir como pendientes).
 */
export default function PdfReindexer() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reindex");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar.");
      setStatus(data as Status);
      return data as Status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run() {
    const fresh = await load();
    if (!fresh) return;
    stopRef.current = false;
    setRunning(true);
    setError(null);

    for (const doc of fresh.pendientes) {
      if (stopRef.current) break;
      setCurrent(doc.name);
      try {
        const res = await fetch(`/api/admin/reindex/${doc.id}`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        setLog((prev) => [
          {
            name: doc.name,
            ok: true,
            detail: `${data.pages} pág. · ${data.visionPages} leídas con visión · ${data.chunks} fragmentos · ${data.segundos} s`,
          },
          ...prev,
        ]);
      } catch (err) {
        setLog((prev) => [
          {
            name: doc.name,
            ok: false,
            detail: err instanceof Error ? err.message : "Ha fallado.",
          },
          ...prev,
        ]);
      }
      // Actualiza el contador sin esperar al final.
      setStatus((s) =>
        s ? { ...s, pendientes: s.pendientes.filter((p) => p.id !== doc.id) } : s,
      );
    }

    setCurrent(null);
    setRunning(false);
    await load();
  }

  const done = status ? status.total - status.pendientes.length : 0;
  const pct = status && status.total > 0 ? Math.round((done / status.total) * 100) : 0;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Lector de PDF</h2>
        <p className="max-w-3xl text-sm text-gray-500">
          Relee los PDF ya subidos página a página. Las tablas y los escaneados se
          leen como imagen, para que el agente entienda filas y columnas, y cada
          fragmento guarda su página: el documento se abre justo ahí. Si uno
          falla, se queda como estaba. Se puede parar y seguir otro día.
        </p>
      </div>

      {status && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-belsue transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-gray-600">
            {done} de {status.total} PDF leídos con el lector nuevo
            {status.sinArchivo > 0 && (
              <span className="text-gray-400">
                {" "}
                · {status.sinArchivo} sin archivo original (no se pueden releer)
              </span>
            )}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!running ? (
          <button
            onClick={run}
            disabled={!status || status.pendientes.length === 0}
            className="rounded-md bg-belsue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {status && status.pendientes.length === 0
              ? "Todos leídos"
              : `Releer ${status?.pendientes.length ?? ""} pendientes`}
          </button>
        ) : (
          <button
            onClick={() => {
              stopRef.current = true;
            }}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Parar al terminar el actual
          </button>
        )}
        {current && (
          <span className="text-sm text-gray-500">
            Leyendo <b className="font-medium text-gray-700">{current}</b>…
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {log.length > 0 && (
        <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-100 text-sm">
          {log.map((l, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
              <span className={l.ok ? "text-gray-800" : "text-red-700"}>
                {l.ok ? "✓" : "✗"} {l.name}
              </span>
              <span className="text-xs text-gray-500">{l.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
