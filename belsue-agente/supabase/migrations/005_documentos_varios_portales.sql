-- ============================================================
--  Migración: un documento puede estar en varios portales
--
--  Hasta ahora `documents.scope` guardaba UN portal. Pasa a haber
--  `documents.scopes`, con la lista de portales en los que se usa el
--  documento (uno, o los dos).
--
--  `scope` se conserva a propósito con el portal principal (el primero
--  de la lista): así el código anterior sigue funcionando mientras se
--  despliega el nuevo. Una vez todo lee `scopes`, se puede eliminar.
-- ============================================================

-- 1. Nueva columna con la lista de portales.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['seguros'];

-- 2. Cada documento existente pasa a la lista con el portal que ya tenía.
UPDATE documents SET scopes = ARRAY[scope] WHERE scopes IS DISTINCT FROM ARRAY[scope];

-- 3. Al menos un portal, y solo valores conocidos.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_scopes_check;
ALTER TABLE documents ADD CONSTRAINT documents_scopes_check CHECK (
  array_length(scopes, 1) >= 1
  AND scopes <@ ARRAY['seguros', 'procedimientos']
);

-- 4. Índice GIN: las consultas pasan a preguntar "¿contiene este portal?".
CREATE INDEX IF NOT EXISTS documents_scopes_idx ON documents USING gin (scopes);

-- 5. La búsqueda por similitud filtra por pertenencia a la lista.
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
    AND (filter_scope IS NULL OR filter_scope = ANY (d.scopes))
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;
