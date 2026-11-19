import type { DefaultSession } from "next-auth";
import type { AgentScope } from "@/lib/scopes";

export type FileType =
  | "pdf"
  | "docx"
  | "txt"
  | "nota"
  | "pptx"
  | "video"
  | "jpg"
  | "png";

export type UserRole = "asesor" | "admin";

/** Refleja la tabla `users` de Supabase (sin password_hash). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  /** true tras un reseteo de administración: debe cambiarla para poder entrar. */
  must_change_password: boolean;
  password_changed_at?: string | null;
}

// --- Augmentación de los tipos de NextAuth para incluir id, role y department ---
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      department?: string;
      mustChangePassword?: boolean;
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    role: UserRole;
    department?: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    department?: string;
    /** Copia del flag de la tabla `users`. El middleware lo lee en cada
     *  petición para retener al usuario en /cuenta/contrasena. */
    mustChangePassword?: boolean;
  }
}

export type DocumentCategory =
  | "auto"
  | "moto"
  | "hogar"
  | "vida"
  | "salud"
  | "decesos"
  | "viaje"
  | "rc"
  | "general";

/** Refleja la tabla `documents` de Supabase. */
export interface Document {
  id: string;
  name: string;
  description: string | null;
  /** null en las notas de conocimiento (no tienen archivo físico). */
  file_path: string | null;
  file_type: FileType;
  file_size: number;
  category: string | null;
  company: string | null;
  /** Texto original de la nota; null en documentos con archivo. */
  content: string | null;
  /** Portales en los que se usa el documento (uno o varios). */
  scopes: AgentScope[];
  created_at: string;
  updated_at: string;
}

/** Refleja la tabla `document_chunks` de Supabase. */
export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
  created_at: string;
}

/** Fuente citada que se devuelve junto a una respuesta del agente. */
export interface Source {
  documentId?: string;
  documentName: string;
  company?: string;
  category?: string;
  content: string;
  similarity: number;
  /** Página del PDF de la que sale el fragmento (si se conoce). */
  page?: number;
}

/** Valoración de una respuesta del asistente: 1 = útil, -1 = poco útil. */
export type Feedback = 1 | -1 | null;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** true si el stream se cortó antes de completarse. */
  incomplete?: boolean;
  /** id del mensaje ya guardado (para poder valorarlo). */
  id?: string;
  /** valoración del usuario, si la hay. */
  feedback?: Feedback;
}

export interface UploadDocumentPayload {
  name: string;
  description?: string;
  category?: string;
  company?: string;
}

// --- Historial de conversaciones ---
export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  /** Pestaña del asistente en la que ocurre la conversación. */
  scope: AgentScope;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  feedback?: Feedback;
  created_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// --- Cursos (formación interna) ---

/** Refleja la tabla `courses`. */
export interface Course {
  id: string;
  title: string;
  description: string | null;
  scope: AgentScope;
  position: number;
  /** false mientras se prepara: solo lo ve administración. */
  published: boolean;
  created_at: string;
}

/** Curso tal y como se lista, con el progreso de quien lo consulta. */
export interface CourseSummary extends Course {
  lesson_count: number;
  viewed_count: number;
}

/** Refleja la tabla `lessons`, con los datos del documento asociado. */
export interface Lesson {
  id: string;
  course_id: string;
  document_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
  /** Datos del material (documento) de la lección. */
  file_type: FileType;
  file_size: number;
  downloadable: boolean;
  /** true si el usuario que consulta ya la ha marcado como vista. */
  viewed: boolean;
}

export interface CourseWithLessons extends Course {
  lessons: Lesson[];
}

// --- Métricas (panel de administración) ---
export interface DayMetrics {
  day: string;
  total_conversations: number;
  active_users: number;
  total_messages: number;
  avg_messages_per_conversation: number;
}

export interface UserMetrics {
  user_id: string;
  user_name: string;
  department: string | null;
  total_conversations: number;
  total_messages: number;
  last_active: string | null;
}

/** Fila devuelta por la función SQL `match_chunks`. */
export interface MatchChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  /** Página del PDF (null en notas, Word… y en PDF aún no releídos). */
  page?: number | null;
  similarity: number;
  document_name: string;
  document_category: string | null;
  document_company: string | null;
  document_scope: string | null;
}

// --- Agenda de contactos ---

/**
 * Refleja la tabla `contacts`. Sustituye a los PDFs de teléfonos: al ser
 * campos y no texto maquetado, un correo ya no puede partirse por la mitad.
 */
export interface Contact {
  id: string;
  company: string;
  department: string | null;
  phone: string | null;
  phone2: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  notes: string | null;
  scope: AgentScope;
  created_at: string;
  updated_at: string;
}

/** Campos que se pueden crear o editar desde la pestaña de contactos. */
export type ContactInput = Omit<
  Contact,
  "id" | "scope" | "created_at" | "updated_at"
>;

// --- Protocolos de incorporación (migración 018) ---

export type ProtocolStatus = "en_curso" | "completada";

export type ProtocolLogAction =
  | "crear"
  | "marcar"
  | "desmarcar"
  | "cambiar_responsable"
  | "observaciones"
  | "completar"
  | "reabrir"
  | "archivar"
  | "desarchivar"
  | "editar_texto"
  | "anadir_paso"
  | "marcar_compania"
  | "desmarcar_compania"
  | "cargar_companias";

/** Tipo de acceso a la web de una compañía. */
export type CompanyAccessType = "general" | "particular";

/** Compañía con la que trabajamos (Protocolos → Compañías). */
export interface ProtocolCompany {
  id: string;
  name: string;
  access_type: CompanyAccessType;
  notes: string | null;
}

/** Check de una compañía dentro de una tarea de ficha. */
export interface ProtocolSubstep {
  id: string;
  step_id: string;
  position: number;
  label: string;
  /** Tipo de acceso copiado al cargarla ("general" | "particular"). */
  detail: string | null;
  completed: boolean;
  completed_by_name: string | null;
  completed_at: string | null;
}

/** Opción de una lista configurable (departamentos y responsables). */
export interface KeyName {
  key: string;
  name: string;
}

/** Tipo de protocolo (una tarjeta) con el número de fichas en curso. */
export interface ProtocolTemplate {
  key: string;
  name: string;
  description: string | null;
  asks_department: boolean;
  date_label: string;
  in_progress: number;
}

/** Fila de la lista de fichas (vista protocol_record_summary). */
export interface ProtocolRecordSummary {
  id: string;
  template_key: string;
  person_name: string;
  start_date: string;
  department_key: string | null;
  department_name: string | null;
  status: ProtocolStatus;
  completed_at: string | null;
  archived_at: string | null;
  created_by_name: string | null;
  created_at: string;
  total_steps: number;
  done_steps: number;
}

export interface ProtocolRecordStep {
  id: string;
  position: number;
  text: string;
  help: string | null;
  allows_notes: boolean;
  role_key: string;
  completed: boolean;
  completed_by_name: string | null;
  completed_at: string | null;
  notes: string | null;
  /** Tarea añadida a mano en esta ficha (no venía de la plantilla). */
  is_extra: boolean;
  /** 'companias' = lleva un check por compañía. */
  subitems: "companias" | null;
}

/** Tarea de una plantilla (pantalla "Editar plantilla"). */
export interface ProtocolTemplateStep {
  id: string;
  position: number;
  text: string;
  help: string | null;
  default_role: string;
  /** {"departments": [...]} → solo para esos departamentos; null = siempre. */
  condition: { departments?: string[] } | null;
  allows_notes: boolean;
  subitems: "companias" | null;
}

export interface ProtocolLogEntry {
  id: string;
  step_id: string | null;
  action: ProtocolLogAction;
  user_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}
