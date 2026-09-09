/**
 * Categorías: lo que se puede saber de ellas SIN tocar la base de datos.
 *
 * La lista de categorías vive en la tabla `categories` (migración 014) y se
 * administra desde `/admin/categorias`. Aquí quedan solo las piezas que
 * necesitan tanto el servidor como el navegador: el tipo, la paleta y cómo se
 * fabrica el valor interno a partir de lo que se escribe.
 *
 * Este módulo es seguro para el cliente: no importa Supabase ni secretos.
 */

import type { AgentScope } from "@/lib/scopes";

export interface Category {
  id: string;
  scope: AgentScope;
  /** Lo que se graba en `documents.category`. No cambia nunca. */
  value: string;
  /** Lo que lee el equipo. Se puede corregir cuando haga falta. */
  label: string;
  color: string;
  position: number;
}

/** Categorías de cada portal, que es como se consultan siempre. */
export type CategoriesByScope = Record<AgentScope, Category[]>;

export const EMPTY_CATEGORIES: CategoriesByScope = {
  seguros: [],
  procedimientos: [],
};

/**
 * Paleta cerrada.
 *
 * Las clases van escritas enteras a propósito: Tailwind rastrea el código
 * fuente en compilación y descarta las que no encuentra literales, así que un
 * `bg-${color}-100` construido al vuelo saldría sin color en producción.
 * Añadir un color nuevo es añadir una línea aquí, no un campo en el panel.
 */
export const CATEGORY_COLORS: Record<string, { label: string; badge: string }> = {
  belsue:    { label: "Belsué",    badge: "bg-belsue/10 text-belsue" },
  azul:      { label: "Azul",      badge: "bg-blue-100 text-blue-700" },
  celeste:   { label: "Celeste",   badge: "bg-sky-100 text-sky-700" },
  cian:      { label: "Cian",      badge: "bg-cyan-100 text-cyan-700" },
  turquesa:  { label: "Turquesa",  badge: "bg-teal-100 text-teal-700" },
  esmeralda: { label: "Esmeralda", badge: "bg-emerald-100 text-emerald-700" },
  verde:     { label: "Verde",     badge: "bg-green-100 text-green-700" },
  lima:      { label: "Lima",      badge: "bg-lime-100 text-lime-700" },
  ambar:     { label: "Ámbar",     badge: "bg-amber-100 text-amber-700" },
  naranja:   { label: "Naranja",   badge: "bg-orange-100 text-orange-700" },
  rojo:      { label: "Rojo",      badge: "bg-red-100 text-red-700" },
  coral:     { label: "Coral",     badge: "bg-rose-100 text-rose-700" },
  rosa:      { label: "Rosa",      badge: "bg-pink-100 text-pink-700" },
  morado:    { label: "Morado",    badge: "bg-purple-100 text-purple-700" },
  violeta:   { label: "Violeta",   badge: "bg-violet-100 text-violet-700" },
  indigo:    { label: "Índigo",    badge: "bg-indigo-100 text-indigo-700" },
  pizarra:   { label: "Pizarra",   badge: "bg-slate-200 text-slate-700" },
  gris:      { label: "Gris",      badge: "bg-gray-200 text-gray-700" },
};

export const DEFAULT_CATEGORY_COLOR = "gris";

/** Distintivo de una categoría; el gris neutro cubre las que ya no existen. */
export function categoryBadge(color: string | null | undefined): string {
  return (
    CATEGORY_COLORS[color ?? ""]?.badge ?? "bg-gray-100 text-gray-600"
  );
}

export function isCategoryColor(value: unknown): value is string {
  return typeof value === "string" && value in CATEGORY_COLORS;
}

/**
 * Categorías que la aplicación necesita y no se dejan borrar ni duplicar:
 *
 *   - `general` es el valor por defecto de los tres formularios.
 *   - `contactos` lo usa la agenda para marcar los documentos que genera, y
 *     esos se esconden del listado de conocimiento (ver /api/documents/browse).
 */
export const RESERVED_CATEGORY_VALUES = ["general", "contactos"];

/**
 * Valor interno a partir de lo que se escribe: "Furgonetas" → `furgonetas`,
 * "Asistencia en viaje" → `asistencia_en_viaje`. Sin tildes ni eñes, porque es
 * lo que queda grabado en cada documento y se compara en las consultas.
 *
 * Devuelve "" si no queda nada aprovechable; quien llame decide qué hacer.
 */
export function slugifyCategory(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
