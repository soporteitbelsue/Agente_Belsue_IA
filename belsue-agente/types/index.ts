import type { DefaultSession } from "next-auth";

export type FileType = "pdf" | "docx" | "txt" | "nota";

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
}

// --- Augmentación de los tipos de NextAuth para incluir id, role y department ---
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      department?: string;
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    role: UserRole;
    department?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    department?: string;
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
  documentName: string;
  company?: string;
  category?: string;
  content: string;
  similarity: number;
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
  similarity: number;
  document_name: string;
  document_category: string | null;
  document_company: string | null;
}
