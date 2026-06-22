export type FileType = "pdf" | "docx" | "txt";

export type DocumentCategory =
  | "auto"
  | "moto"
  | "hogar"
  | "vida"
  | "salud"
  | "decesos"
  | "viaje"
  | "general";

/** Refleja la tabla `documents` de Supabase. */
export interface Document {
  id: string;
  name: string;
  description: string | null;
  file_path: string;
  file_type: FileType;
  file_size: number;
  category: string | null;
  company: string | null;
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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** true si el stream se cortó antes de completarse. */
  incomplete?: boolean;
}

export interface UploadDocumentPayload {
  name: string;
  description?: string;
  category?: string;
  company?: string;
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
