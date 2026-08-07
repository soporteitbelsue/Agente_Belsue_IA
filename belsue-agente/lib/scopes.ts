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

export interface ScopeCategory {
  value: string;
  label: string;
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
  /** Categorías de documentos y notas propias del ámbito. */
  categories: ScopeCategory[];
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
  /** Texto de la página de documentos. */
  documentsDescription: string;
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
  categories: [
    { value: "general", label: "General" },
    { value: "auto", label: "Auto" },
    { value: "moto", label: "Moto" },
    { value: "hogar", label: "Hogar" },
    { value: "vida", label: "Vida" },
    { value: "salud", label: "Salud" },
    { value: "decesos", label: "Decesos" },
    { value: "viaje", label: "Asistencia en viaje" },
    { value: "rc", label: "Responsabilidad Civil" },
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
      "Reglas y recomendaciones sobre producto y compañías que aporta todo el equipo. El agente las usa para responder. Cualquiera puede añadir.",
  },
  documentsDescription:
    "Consulta, sube y descarga los documentos y condicionados del equipo.",
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
  categories: [
    { value: "general", label: "General" },
    { value: "organizacion", label: "Organización y reparto de tareas" },
    { value: "atencion", label: "Atención al cliente" },
    { value: "produccion", label: "Nueva producción y cotizaciones" },
    { value: "polizas", label: "Gestión de pólizas" },
    { value: "siniestros", label: "Siniestros" },
    { value: "cobros", label: "Cobros e impagados" },
    { value: "herramientas", label: "Herramientas y programas" },
    { value: "personal", label: "Personal y horarios" },
    { value: "normativa", label: "Normativa y protección de datos" },
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
      "Cómo nos organizamos y cómo se hace cada cosa en la oficina. El agente lo usa para responder. Cualquiera puede añadir.",
  },
  documentsDescription:
    "Manuales, protocolos y plantillas internas de la oficina.",
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

/** Opciones de categoría con un "Todas" delante, para los filtros. */
export function categoryFilterOptions(scope: unknown): ScopeCategory[] {
  return [{ value: "", label: "Todas" }, ...scopeConfig(scope).categories];
}

/**
 * Color del badge de categoría. Cubre las categorías de todos los ámbitos:
 * las páginas de listado son comunes y no saben de qué ámbito viene cada fila.
 */
export const CATEGORY_BADGE: Record<string, string> = {
  // Ramos (seguros)
  auto: "bg-blue-100 text-blue-700",
  moto: "bg-orange-100 text-orange-700",
  hogar: "bg-green-100 text-green-700",
  vida: "bg-purple-100 text-purple-700",
  salud: "bg-pink-100 text-pink-700",
  decesos: "bg-gray-200 text-gray-700",
  viaje: "bg-teal-100 text-teal-700",
  rc: "bg-indigo-100 text-indigo-700",
  general: "bg-belsue/10 text-belsue",
  // Procedimientos internos
  organizacion: "bg-amber-100 text-amber-700",
  atencion: "bg-sky-100 text-sky-700",
  produccion: "bg-lime-100 text-lime-700",
  polizas: "bg-cyan-100 text-cyan-700",
  siniestros: "bg-red-100 text-red-700",
  cobros: "bg-emerald-100 text-emerald-700",
  herramientas: "bg-violet-100 text-violet-700",
  personal: "bg-rose-100 text-rose-700",
  normativa: "bg-slate-200 text-slate-700",
};

/** Etiqueta legible de una categoría dentro de su ámbito. */
export function categoryLabel(scope: unknown, value: string | null): string {
  if (!value) return "—";
  const found = scopeConfig(scope).categories.find((c) => c.value === value);
  return found?.label ?? value;
}
