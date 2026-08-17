/**
 * Marcadores de carga con la forma de lo que va a aparecer. Frente a un
 * "Cargando…" suelto, la página no da el salto al llegar los datos y la espera
 * se percibe más corta. El historial del chat ya los usaba; esto los unifica.
 */

/** Filas de una tabla (Documentos). */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-0"
        >
          <div className="h-3.5 flex-1 animate-pulse rounded bg-gray-200/70" />
          <div className="hidden h-3.5 w-24 animate-pulse rounded bg-gray-200/70 sm:block" />
          <div className="hidden h-5 w-20 animate-pulse rounded-full bg-gray-200/70 sm:block" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-gray-200/70" />
        </div>
      ))}
    </div>
  );
}

/** Tarjetas en rejilla (Conocimiento). */
export function CardsSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    // Mismas columnas que el listado real, para que no dé el salto al cargar.
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200/70" />
            <div className="h-5 w-16 animate-pulse rounded bg-gray-200/70" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-gray-200/70" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-gray-200/70" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200/70" />
          </div>
          <div className="mt-4 h-3 w-1/3 animate-pulse rounded bg-gray-200/70" />
        </div>
      ))}
    </div>
  );
}
