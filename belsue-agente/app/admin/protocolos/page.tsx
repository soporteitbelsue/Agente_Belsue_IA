"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import type { ProtocolTemplate } from "@/types";

/**
 * Protocolos: una tarjeta por tipo (Nuevo empleado, Nuevo colaborador externo…).
 * Las tarjetas salen de la tabla protocol_templates: un tipo nuevo (p. ej.
 * "Baja") aparece aquí solo con darlo de alta en la base de datos.
 */
export default function ProtocolosPage() {
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/protocolos");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al cargar los protocolos.");
        setTemplates(data.templates);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar los protocolos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a los portales
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Protocolos</h1>
        <p className="text-sm text-gray-500">
          Checklists de incorporación por persona: quién ha hecho cada paso y
          cuándo, con su historial.
        </p>
      </div>

      <AdminTabs active="/admin/protocolos" />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-lg border border-gray-200 bg-white shadow-sm"
            />
          ))}

        {!loading &&
          templates.map((t) => (
            <Link
              key={t.key}
              href={`/admin/protocolos/${t.key}`}
              className="group flex flex-col justify-between rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-belsue hover:shadow-md"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-800 group-hover:text-belsue">
                  {t.name}
                </h2>
                {t.description && (
                  <p className="mt-1 text-sm text-gray-500">{t.description}</p>
                )}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <span className="text-3xl font-bold tabular-nums text-belsue">
                    {t.in_progress}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    {t.in_progress === 1 ? "ficha en curso" : "fichas en curso"}
                  </span>
                </div>
                <span className="text-sm font-medium text-belsue">Abrir →</span>
              </div>
            </Link>
          ))}

        {!loading && (
          <Link
            href="/admin/protocolos/companias"
            className="group flex flex-col justify-between rounded-lg border border-dashed border-gray-300 bg-white p-5 transition hover:border-belsue"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-800 group-hover:text-belsue">
                Compañías
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Lista de compañías con las que trabajamos y si su acceso web es
                general o particular.
              </p>
            </div>
            <span className="mt-4 text-sm font-medium text-belsue">Gestionar →</span>
          </Link>
        )}

        {!loading && !error && templates.length === 0 && (
          <p className="text-sm text-gray-500">
            No hay protocolos definidos. Aplica la migración 018.
          </p>
        )}
      </div>
    </div>
  );
}
