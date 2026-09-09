/**
 * Ámbitos del asistente.
 *
 * Cada ámbito es una pestaña independiente del agente: tiene su propio
 * conocimiento (documentos y notas), su propio historial de conversaciones y su
 * propio prompt de sistema (ver `lib/prompts.ts`).
 *
 *   - 'seguros'        → El Formador: producto, compañías, condicionados.
 *   - 'procedimientos' → Cómo trabajamos por dentro: organización de la
 *                        oficina, circuitos, herramientas, quién hace qué.
 *
 * Las CATEGORÍAS de cada ámbito ya no están aquí: se administran desde
 * /admin/categorias y viven en la tabla `categories` (ver lib/categories.ts).
 * Aquí queda lo que no cambia sin tocar código: los portales y sus textos.
 *
 * Este módulo es seguro para el cliente (no contiene prompts ni secretos).
 */

export const AGENT_SCOPES = ["seguros", "procedimientos"] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

/** Ámbito por defecto: el comportamiento histórico de la app. */
export const DEFAULT_SCOPE: AgentScope = "seguros";

export function isAgentScope(value: unknown): value is AgentScope {
  return (
    typeof value === "string" &&
    (AGENT_SCOPES as readonly string[]).includes(value)
  );
}

/** Normaliza un valor cualquiera (query param, body, BD) a un ámbito válido. */
export function parseScope(value: unknown): AgentScope {
  return isAgentScope(value) ? value : DEFAULT_SCOPE;
}

/**
 * Normaliza la LISTA de portales de un documento. Un documento puede estar en
 * varios (por ejemplo, un protocolo que sirve tanto para producto como para la
 * organización interna). Nunca devuelve una lista vacía.
 */
export function parseScopes(value: unknown): AgentScope[] {
  const list = Array.isArray(value) ? value.filter(isAgentScope) : [];
  const unique = sortScopes([...new Set(list)]);
  return unique.length > 0 ? unique : [DEFAULT_SCOPE];
}

/** Ordena una selección de portales según el orden canónico. */
export function sortScopes(scopes: AgentScope[]): AgentScope[] {
  return AGENT_SCOPES.filter((s) => scopes.includes(s));
}

/**
 * Portal principal de un documento: el primero de la lista. Decide de qué
 * portal son las categorías disponibles y qué valor se guarda en la columna
 * `scope`, que se mantiene por compatibilidad.
 */
export function primaryScope(scopes: AgentScope[]): AgentScope {
  return scopes[0] ?? DEFAULT_SCOPE;
}

export interface ScopeConfig {
  id: AgentScope;
  /** Nombre del asistente en esta pestaña. */
  title: string;
  /** Etiqueta corta para la navegación. */
  navLabel: string;
  /** Ruta del chat de este ámbito. */
  path: string;
  /** Frase de apoyo para cabeceras de página. */
  description: string;
  /** Mensaje de bienvenida del chat. */
  welcome: string;
  /** Sugerencias que se muestran al abrir una conversación vacía. */
  suggestions: string[];
  /**
   * La columna `company` de `documents` se reutiliza en procedimientos como
   * "área/departamento": mismo campo, distinta etiqueta según el ámbito.
   */
  secondaryField: { label: string; placeholder: string };
  /** Textos del formulario de notas. */
  note: {
    heading: string;
    help: string;
    titlePlaceholder: string;
    contentPlaceholder: string;
    /** Aviso del modal "Aportar conocimiento". */
    contributeHint: string;
  };
  /** Textos de la página de conocimiento del equipo. */
  knowledge: { title: string; description: string };
  /** Secciones propias del portal, además de documentos y conocimiento. */
  extraLinks?: { label: string; href: string }[];
}

const SEGUROS: ScopeConfig = {
  id: "seguros",
  title: "El Formador",
  navLabel: "El Formador",
  path: "/chat",
  description:
    "Producto, compañías y condicionados: todo lo que necesitas para asesorar.",
  welcome: `¡Hola! Soy el asistente interno de Belsué. Puedo ayudarte con dudas sobre:
- Coberturas y condicionados de compañías aseguradoras
- Comparativas entre productos
- Argumentarios de venta y objeciones
- Cualquier duda sobre los ramos que gestionamos

¿En qué puedo ayudarte hoy?`,
  suggestions: [
    "¿Qué cubre el seguro de hogar de Mapfre?",
    "Diferencias entre cobertura de terceros y todo riesgo",
    "¿Qué compañía va mejor para un conductor novel?",
  ],
  secondaryField: {
    label: "Compañía aseguradora",
    placeholder: "Ej: Mapfre, Allianz, AXA, Generali...",
  },
  note: {
    heading: "Añadir conocimiento (nota)",
    help: "Escribe una regla o recomendación (p. ej. “Para cotizar auto con conductor novel, mejor en tal compañía”). El agente la usará como una fuente más, sin necesidad de subir un documento.",
    titlePlaceholder: "Ej: Cotización auto conductor novel",
    contentPlaceholder: "Escribe aquí la información, regla o recomendación…",
    contributeHint:
      "Lo que aportes aquí lo usará el agente para responder a todo el equipo. Sé concreto (compañía, ramo, condición).",
  },
  knowledge: {
    title: "Conocimiento del equipo",
    description:
      "Notas y documentos sobre producto y compañías. El agente los usa para responder. Cualquiera puede añadir.",
  },
};

const PROCEDIMIENTOS: ScopeConfig = {
  id: "procedimientos",
  title: "Procedimientos internos",
  navLabel: "Procedimientos",
  path: "/procedimientos",
  description:
    "Cómo trabajamos por dentro: organización, circuitos y herramientas de la oficina.",
  welcome: `¡Hola! Soy el asistente de procedimientos internos de Belsué. Aquí resuelvo dudas sobre cómo trabajamos por dentro:
- Cómo nos organizamos y quién se encarga de cada cosa
- Pasos de los trámites internos (altas, modificaciones, siniestros, cobros)
- Herramientas y programas que usamos y cómo los usamos
- Normas y rutinas del día a día de la oficina

¿Qué necesitas saber?`,
  suggestions: [
    "¿Cómo nos organizamos para atender el teléfono?",
    "¿Qué pasos sigo para dar de alta una póliza nueva?",
    "¿A quién aviso si un cliente reclama un siniestro?",
  ],
  secondaryField: {
    label: "Área o responsable",
    placeholder: "Ej: Recepción, Producción, Siniestros, Dirección...",
  },
  note: {
    heading: "Añadir procedimiento (nota)",
    help: "Explica cómo se hace algo en la oficina (p. ej. “Cuando entra un siniestro por teléfono, se abre parte en el gestor y se avisa al responsable del ramo”). El agente lo usará para resolver dudas del equipo.",
    titlePlaceholder: "Ej: Alta de póliza nueva paso a paso",
    contentPlaceholder:
      "Describe el procedimiento: cuándo aplica, pasos, quién lo hace y dónde se registra…",
    contributeHint:
      "Lo que aportes aquí lo usará el agente para explicar al equipo cómo trabajamos. Sé concreto: pasos, responsable y herramienta.",
  },
  knowledge: {
    title: "Procedimientos del equipo",
    description:
      "Cómo nos organizamos y cómo se hace cada cosa en la oficina, en notas y documentos. El agente los usa para responder. Cualquiera puede añadir.",
  },
  extraLinks: [
    { label: "Cursos", href: "/procedimientos/cursos" },
    { label: "Contactos", href: "/procedimientos/contactos" },
  ],
};

export const SCOPES: Record<AgentScope, ScopeConfig> = {
  seguros: SEGUROS,
  procedimientos: PROCEDIMIENTOS,
};

/** Config de un ámbito, tolerando valores desconocidos. */
export function scopeConfig(scope: unknown): ScopeConfig {
  return SCOPES[parseScope(scope)];
}

/** Lista ordenada de ámbitos, para pintar la navegación por pestañas. */
export const SCOPE_LIST: ScopeConfig[] = AGENT_SCOPES.map((s) => SCOPES[s]);

