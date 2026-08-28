"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Contact } from "@/types";

const SCOPE = "procedimientos";

/** Campos editables, en el orden en que se pintan en el formulario. */
const CAMPOS: { k: keyof Contact; label: string; ancho?: string }[] = [
  { k: "company", label: "Compañía" },
  { k: "department", label: "Departamento o persona" },
  { k: "phone", label: "Teléfono" },
  { k: "phone2", label: "Teléfono 2" },
  { k: "mobile", label: "Móvil" },
  { k: "fax", label: "Fax" },
  { k: "email", label: "Correo", ancho: "sm:col-span-2" },
  { k: "address", label: "Dirección", ancho: "sm:col-span-2" },
  { k: "city", label: "Población" },
  { k: "postal_code", label: "Código postal" },
  { k: "province", label: "Provincia" },
];

type Borrador = Partial<Record<keyof Contact, string>>;

const vacio: Borrador = { company: "" };

function aBorrador(c: Contact): Borrador {
  const b: Borrador = {};
  for (const { k } of CAMPOS) b[k] = (c[k] as string | null) ?? "";
  b.notes = c.notes ?? "";
  return b;
}

/** Une teléfono, móvil y fax en una sola celda, etiquetados. */
function Vias({ c }: { c: Contact }) {
  const vias = [
    { etiqueta: "Tel", valor: c.phone },
    { etiqueta: "Tel2", valor: c.phone2 },
    { etiqueta: "Móv", valor: c.mobile },
    { etiqueta: "Fax", valor: c.fax },
  ].filter((v) => v.valor);

  if (vias.length === 0) return <span className="text-gray-300">—</span>;

  return (
    <div className="space-y-0.5">
      {vias.map((v) => (
        <div key={v.etiqueta} className="whitespace-nowrap">
          <span className="text-xs text-gray-400">{v.etiqueta}</span>{" "}
          <a href={`tel:${v.valor}`} className="text-gray-700 hover:text-belsue hover:underline">
            {v.valor}
          </a>
        </div>
      ))}
    </div>
  );
}

/** Formulario de alta o edición. */
function Formulario({
  borrador,
  setBorrador,
  onGuardar,
  onCancelar,
  guardando,
  titulo,
}: {
  borrador: Borrador;
  setBorrador: (b: Borrador) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  guardando: boolean;
  titulo: string;
}) {
  return (
    <div className="rounded-lg border border-belsue/30 bg-belsue/5 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        {CAMPOS.map(({ k, label, ancho }) => (
          <label key={k} className={`block ${ancho ?? ""}`}>
            <span className="mb-1 block text-xs font-medium text-gray-600">
              {label}
              {k === "company" && <span className="text-red-500"> *</span>}
            </span>
            <input
              value={borrador[k] ?? ""}
              onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-belsue focus:outline-none"
            />
          </label>
        ))}
        <label className="block sm:col-span-4">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            Notas (horarios, avisos, extensiones…)
          </span>
          <textarea
            rows={2}
            value={borrador.notes ?? ""}
            onChange={(e) => setBorrador({ ...borrador, notes: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-belsue focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onGuardar}
          disabled={guardando || !borrador.company?.trim()}
          className="rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white transition hover:bg-belsue-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Al guardar, el agente se actualiza solo con este contacto.
      </p>
    </div>
  );
}

/**
 * Agenda de contactos del equipo. Sustituye a los PDFs de teléfonos: aquí los
 * datos son campos, así que un correo no puede partirse por la mitad como
 * pasaba al extraer el texto del PDF. Cualquiera del equipo puede corregirla.
 */
export default function ContactosPage() {
  const [contactos, setContactos] = useState<Contact[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(vacio);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/contactos?scope=${SCOPE}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar los contactos.");
      setContactos(data.contacts as Contact[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const nuevo = editando === null;
      const res = await fetch(
        nuevo ? "/api/contactos" : `/api/contactos/${editando}`,
        {
          method: nuevo ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...borrador, scope: SCOPE }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
      if (data.warning) setAviso(data.warning);
      setCreando(false);
      setEditando(null);
      setBorrador(vacio);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(c: Contact) {
    const quien = c.department ? `${c.company} — ${c.department}` : c.company;
    if (!confirm(`¿Borrar "${quien}" de la agenda?`)) return;
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/contactos/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar.");
      if (data.warning) setAviso(data.warning);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }

  const termino = busqueda.trim().toLowerCase();
  const filtrados = termino
    ? contactos.filter((c) =>
        [
          c.company,
          c.department,
          c.phone,
          c.phone2,
          c.mobile,
          c.fax,
          c.email,
          c.city,
          c.province,
          c.notes,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(termino)),
      )
    : contactos;

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/procedimientos"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
          >
            ← Volver a Procedimientos internos
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">Contactos</h1>
          <p className="text-sm text-gray-500">
            Teléfonos y correos de compañías, proveedores y colaboradores.
            Cualquiera puede corregirlos, y el agente aprende el cambio al
            momento.
          </p>
        </div>
        {!creando && editando === null && (
          <button
            onClick={() => {
              setBorrador(vacio);
              setCreando(true);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-belsue px-4 py-2 text-sm font-medium text-white transition hover:bg-belsue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Añadir contacto
          </button>
        )}
      </div>

      {(creando || editando !== null) && (
        <Formulario
          borrador={borrador}
          setBorrador={setBorrador}
          onGuardar={guardar}
          onCancelar={() => {
            setCreando(false);
            setEditando(null);
            setBorrador(vacio);
          }}
          guardando={guardando}
          titulo={editando === null ? "Nuevo contacto" : "Editar contacto"}
        />
      )}

      {contactos.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por compañía, departamento, teléfono o correo…"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-belsue focus:outline-none"
          />
          <span className="shrink-0 text-sm text-gray-400">
            {filtrados.length === contactos.length
              ? `${contactos.length} contactos`
              : `${filtrados.length} de ${contactos.length}`}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {aviso && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {aviso}
        </p>
      )}
      {cargando && <p className="text-sm text-gray-400">Cargando…</p>}

      {!cargando && contactos.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">
            La agenda está vacía. Pulsa «Añadir contacto» para empezar.
          </p>
        </div>
      )}

      {!cargando && contactos.length > 0 && filtrados.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">
            Ningún contacto coincide con «{busqueda.trim()}».
          </p>
          <button
            onClick={() => setBusqueda("")}
            className="mt-2 text-sm font-medium text-belsue hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Compañía</th>
                <th className="px-3 py-2 font-medium">Departamento o persona</th>
                <th className="px-3 py-2 font-medium">Teléfonos</th>
                <th className="px-3 py-2 font-medium">Correo</th>
                <th className="px-3 py-2 font-medium">Población</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((c) => (
                <tr key={c.id} className="align-top hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {c.company}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {c.department ?? <span className="text-gray-300">—</span>}
                    {c.notes && (
                      <span
                        title={c.notes}
                        className="ml-1 cursor-help text-amber-500"
                      >
                        ⚑
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Vias c={c} />
                  </td>
                  <td className="px-3 py-2">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="break-all text-belsue hover:underline"
                      >
                        {c.email}
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {c.city ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      onClick={() => {
                        setBorrador(aBorrador(c));
                        setEditando(c.id);
                        setCreando(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-xs font-medium text-belsue hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => borrar(c)}
                      className="ml-3 text-xs font-medium text-gray-400 hover:text-red-500 hover:underline"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
