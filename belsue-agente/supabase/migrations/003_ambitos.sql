-- ============================================================
--  Migración: Ámbitos del asistente (scope)
--
--  El asistente pasa a tener dos "pestañas" independientes:
--    - 'seguros'       → El Formador (producto, compañías, condicionados)
--    - 'procedimientos'→ Procedimientos internos de la oficina
--
--  Cada ámbito tiene su propio conocimiento (documentos y notas), su propio
--  historial de conversaciones y su propio prompt. Todo lo existente queda
--  en 'seguros', que es el comportamiento de siempre.
-- ============================================================

-- 1. Ámbito de cada documento/nota.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'seguros';

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_scope_check;
ALTER TABLE documents ADD CONSTRAINT documents_scope_check
  CHECK (scope IN ('seguros', 'procedimientos'));

CREATE INDEX IF NOT EXISTS documents_scope_idx ON documents (scope);

-- 2. Ámbito de cada conversación (el historial no se mezcla entre pestañas).
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'seguros';

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_scope_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_scope_check
  CHECK (scope IN ('seguros', 'procedimientos'));

CREATE INDEX IF NOT EXISTS conversations_user_scope_last_idx
  ON conversations (user_id, scope, last_message_at DESC);

-- 3. La búsqueda por similitud pasa a filtrar por ámbito.
--    Se elimina la versión de 3 argumentos para no dejar dos sobrecargas
--    ambiguas: la nueva sigue siendo compatible (filter_scope por defecto NULL
--    = buscar en todos los ámbitos).
DROP FUNCTION IF EXISTS match_chunks(vector, float, int);

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
