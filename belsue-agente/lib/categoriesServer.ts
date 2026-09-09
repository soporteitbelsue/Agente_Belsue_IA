import { supabaseServer } from "@/lib/supabase";
import { isAgentScope } from "@/lib/scopes";
import {
  EMPTY_CATEGORIES,
  type CategoriesByScope,
  type Category,
} from "@/lib/categories";

/**
 * Lectura de las categorías desde el servidor. Solo aquí se toca la tabla:
 * el navegador las recibe ya cargadas (ver `CategoriesProvider`).
 */

export const CATEGORY_FIELDS = "id, scope, value, label, color, position";

/**
 * Todas las categorías, agrupadas por portal y en su orden.
 *
 * Si la consulta falla devuelve las listas vacías en vez de reventar: esto se
 * llama desde el layout, o sea en TODAS las páginas. Con la tabla aún sin
 * crear —código desplegado antes que la migración— el portal sigue en pie y
 * lo único que se ve es que no hay categorías que elegir.
 */
export async function loadCategories(): Promise<CategoriesByScope> {
  try {
    const { data, error } = await supabaseServer()
      .from("categories")
      .select(CATEGORY_FIELDS)
      .order("scope", { ascending: true })
      .order("position", { ascending: true });

    if (error) {
      console.error("[categories] Error al cargar:", error.message);
      return EMPTY_CATEGORIES;
    }
    return groupByScope((data ?? []) as Category[]);
  } catch (err) {
    console.error("[categories] Error al cargar:", err);
    return EMPTY_CATEGORIES;
  }
}

/** Agrupa por portal descartando los ámbitos que no reconocemos. */
export function groupByScope(rows: Category[]): CategoriesByScope {
  const byScope: CategoriesByScope = { seguros: [], procedimientos: [] };
  for (const row of rows) {
    if (isAgentScope(row.scope)) byScope[row.scope].push(row);
  }
  return byScope;
}

/**
 * Etiquetas de un portal, `valor → nombre legible`. Lo usa el catálogo que ve
 * el agente, que enumera el inventario agrupado por categoría.
 */
export async function categoryLabels(
  scope: string,
): Promise<Map<string, string>> {
  const all = await loadCategories();
  const list = isAgentScope(scope) ? all[scope] : [];
  return new Map(list.map((c) => [c.value, c.label]));
}
