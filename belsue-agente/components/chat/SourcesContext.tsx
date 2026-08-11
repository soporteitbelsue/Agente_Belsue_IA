"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SourcesState {
  /** true si el panel de fuentes está desplegado. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Fragmentos que se están mostrando (para el contador del botón). */
  count: number;
  setCount: (count: number) => void;
  /**
   * true solo mientras hay un chat en pantalla. La cabecera es común a toda la
   * aplicación y el botón de fuentes no pinta nada en Documentos o en el
   * panel de administración.
   */
  available: boolean;
  setAvailable: (available: boolean) => void;
}

const SourcesContext = createContext<SourcesState | null>(null);

/**
 * Conecta el botón de la barra superior con el panel de fuentes del chat, que
 * son componentes distintos y en ramas distintas del árbol.
 */
export function SourcesProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [available, setAvailable] = useState(false);

  const value = useMemo(
    () => ({ open, setOpen, count, setCount, available, setAvailable }),
    [open, count, available],
  );

  return (
    <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
  );
}

/** Devuelve null fuera del proveedor, para que la cabecera no reviente. */
export function useSources(): SourcesState | null {
  return useContext(SourcesContext);
}
