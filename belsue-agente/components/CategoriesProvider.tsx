"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  EMPTY_CATEGORIES,
  categoryBadge,
  type CategoriesByScope,
  type Category,
} from "@/lib/categories";
import type { AgentScope } from "@/lib/scopes";

/**
 * Las categorías, disponibles en toda la aplicación.
 *
 * Llegan ya cargadas desde el layout (servidor), así que no hay parpadeo al
 * pintar. A partir de ahí se refrescan solas: al montar y cada vez que la
 * pestaña vuelve a primer plano.
 *
 * Esto último no es un adorno. La lista la comparte toda la oficina: quien
 * cree una categoría lo hace en su pestaña, y las demás —abiertas desde antes,
 * quizá en otro ordenador— se quedaban con la lista de cuando se cargaron.
 * "La he creado y no me sale" era exactamente eso.
 */

interface CategoriesValue {
  byScope: CategoriesByScope;
  all: Category[];
  refresh: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesValue>({
  byScope: EMPTY_CATEGORIES,
  all: [],
  refresh: async () => {},
});

export default function CategoriesProvider({
  initial,
  children,
}: {
  initial: CategoriesByScope;
  children: React.ReactNode;
}) {
  const [byScope, setByScope] = useState<CategoriesByScope>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) return;
      const data = await res.json();
      setByScope(data.categories as CategoriesByScope);
    } catch {
      // Si falla, se siguen usando las que ya había: mejor una lista algo
      // vieja que un desplegable vacío.
    }
  }, []);

  // Al montar y al volver a la pestaña. Volver de administración de crear una
  // categoría es justo un cambio de foco, así que el caso normal queda cubierto
  // sin que nadie tenga que recargar nada.
  useEffect(() => {
    refresh();

    const alVolver = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [refresh]);

  const value = useMemo<CategoriesValue>(
    () => ({
      byScope,
      all: [...byScope.seguros, ...byScope.procedimientos],
      refresh,
    }),
    [byScope, refresh],
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

/** Categorías de un portal, en su orden. */
export function useCategories(scope: AgentScope): Category[] {
  return useContext(CategoriesContext).byScope[scope];
}

/** Las de los dos portales, para las pantallas de administración. */
export function useAllCategories(): CategoriesByScope {
  return useContext(CategoriesContext).byScope;
}

export function useCategoriesRefresh(): () => Promise<void> {
  return useContext(CategoriesContext).refresh;
}

/** Opciones de un filtro, con "Todas" delante. */
export function useCategoryFilterOptions(
  scope: AgentScope,
): { value: string; label: string }[] {
  const categories = useCategories(scope);
  return useMemo(
    () => [
      { value: "", label: "Todas" },
      ...categories.map((c) => ({ value: c.value, label: c.label })),
    ],
    [categories],
  );
}

/**
 * Cómo se pinta una categoría cuando no se sabe de qué portal viene: los
 * listados mezclan filas de los dos. Una categoría borrada ya no está en la
 * tabla, así que se muestra su valor crudo en gris en vez de desaparecer.
 */
export function useCategoryLookup(): {
  label: (value: string | null) => string;
  badge: (value: string | null) => string;
} {
  const { all } = useContext(CategoriesContext);
  return useMemo(() => {
    const byValue = new Map(all.map((c) => [c.value, c]));
    return {
      label: (value) => (value ? (byValue.get(value)?.label ?? value) : "—"),
      badge: (value) => categoryBadge(byValue.get(value ?? "")?.color),
    };
  }, [all]);
}
