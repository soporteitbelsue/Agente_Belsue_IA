-- ============================================================
--  Belsue Agente — Schema de Supabase (PostgreSQL + pgvector)
-- ============================================================

-- 1. Extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Extensión para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabla documents
CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  file_path   text NOT NULL,
  file_type   text NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt')),
  file_size   integer NOT NULL,
  category    text,
  company     text,
  -- Ámbito del asistente al que pertenece: 'seguros' (El Formador) o
  -- 'procedimientos' (cómo trabajamos por dentro). Ver migración 003.
  scope       text NOT NULL DEFAULT 'seguros'
              CHECK (scope IN ('seguros', 'procedimientos')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Tabla document_chunks
CREATE TABLE IF NOT EXISTS document_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     text NOT NULL,
  embedding   vector(1536) NOT NULL,
  chunk_index integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. Función de búsqueda por similitud
-- `filter_scope` NULL busca en todos los ámbitos; con valor, restringe a él.
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_scope text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  similarity float,
  document_name text,
  document_category text,
  document_company text,
  document_scope text
)
LANGUAGE sql STABLE AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.name AS document_name,
    d.category AS document_category,
    d.company AS document_company,
    d.scope AS document_scope
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND (filter_scope IS NULL OR d.scope = filter_scope)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 5. Búsqueda por similitud
-- NO usamos índice ivfflat: con pocas miles de filas, un ivfflat mal
-- dimensionado (lists altas, probes=1) tiene MALA recall y oculta resultados
-- (solo compara con ~1% de los vectores). A esta escala, la búsqueda EXACTA
-- (sin índice, seq scan) es rápida y tiene recall 100%.
-- Si algún día se superan ~cientos de miles de fragmentos y la latencia sube,
-- crear un índice HNSW (mejor recall que ivfflat):
--   CREATE INDEX document_chunks_embedding_idx
--     ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Índice auxiliar para joins por documento
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON document_chunks (document_id);

-- Trigger para mantener updated_at en documents
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_set_updated_at ON documents;
CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
