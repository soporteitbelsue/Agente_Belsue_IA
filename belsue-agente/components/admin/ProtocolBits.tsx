import type { ProtocolStatus } from "@/types";

/** "2026-11-18" → "18/11/2026", sin pasar por Date (evita el salto de zona horaria). */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : day;
}

/** Marca de tiempo → "18/11/2026 10:42". */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatusBadge({
  status,
  archived,
}: {
  status: ProtocolStatus;
  archived?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {status === "completada" ? (
        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          Completada
        </span>
      ) : (
        <span className="rounded bg-belsue/10 px-2 py-0.5 text-xs font-medium text-belsue">
          En curso
        </span>
      )}
      {archived && (
        <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
          Archivada
        </span>
      )}
    </span>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-24 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-belsue"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-gray-600">
        {done}/{total}
      </span>
    </div>
  );
}

/** General (mismas credenciales para todos) / Particular (cada uno las suyas). */
export function AccessTypeBadge({ type }: { type: string | null }) {
  if (type === "general") {
    return (
      <span
        title="Mismas credenciales para todos"
        className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
      >
        General
      </span>
    );
  }
  if (type === "particular") {
    return (
      <span
        title="Cada persona tiene sus propias credenciales"
        className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700"
      >
        Particular
      </span>
    );
  }
  return null;
}
