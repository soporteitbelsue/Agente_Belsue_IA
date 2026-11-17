-- 017 · Página de cada fragmento
--
-- El lector de PDF trocea página a página y guarda de cuál sale cada
-- fragmento. Sirve para que el agente cite la página y para abrir el PDF
-- justo ahí. Los fragmentos de notas, Word, etc. la dejan en NULL, igual que
-- los PDF indexados antes de este cambio hasta que se relean.
--
-- Aplicar en el VPS:
--   cd /opt/belsue/supabase
--   docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 \
--     < /opt/belsue/app/belsue-agente/supabase/migrations/017_pagina_de_cada_fragmento.sql
--
-- Se puede relanzar sin miedo.

ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page integer;

-- Las dos búsquedas devuelven ahora también la página. Cambiar las columnas
-- que devuelve una función obliga a borrarla y crearla de nuevo.
DROP FUNCTION IF EXISTS match_chunks(vector, float, int, text);
DROP FUNCTION IF EXISTS match_chunks_hybrid(vector, text, float, int, text);

CREATE FUNCTION match_chunks(
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
  page int,
  similarity float,
  document_name text,
  document_category text,
  document_company text,
  document_scope text
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.page,
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

-- Igual que en la 016, con la página. Ver allí el porqué de cada paso.
CREATE FUNCTION match_chunks_hybrid(
  query_embedding vector(1536),
  query_text text,
  match_threshold float,
  match_count int,
  filter_scope text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  page int,
  similarity float,
  document_name text,
  document_category text,
  document_company text,
  document_scope text
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH
  q AS (
    SELECT nullif(
      replace(plainto_tsquery('spanish', belsue_normaliza(query_text))::text, '&', '|'),
      ''
    )::tsquery AS tsq
  ),
  pool AS (
    SELECT greatest(match_count * 4, 40) AS n
  ),
  docs AS (
    SELECT d.id, d.name, d.category, d.company, d.scope,
           to_tsvector('spanish', belsue_normaliza(
             coalesce(d.name, '') || ' ' || coalesce(d.company, '') || ' ' || coalesce(d.category, '')
           )) AS meta
    FROM documents d
    WHERE filter_scope IS NULL OR filter_scope = ANY (d.scopes)
  ),
  semantic AS (
    SELECT dc.id,
           row_number() OVER (ORDER BY dc.embedding <=> query_embedding) AS pos
    FROM document_chunks dc
    JOIN docs ON docs.id = dc.document_id
    WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT (SELECT n FROM pool)
  ),
  keyword AS (
    SELECT dc.id,
           row_number() OVER (
             ORDER BY ts_rank_cd(dc.fts, q.tsq) + 0.5 * ts_rank(docs.meta, q.tsq) DESC
           ) AS pos
    FROM document_chunks dc
    JOIN docs ON docs.id = dc.document_id
    CROSS JOIN q
    WHERE q.tsq IS NOT NULL
      AND dc.fts @@ q.tsq
    ORDER BY ts_rank_cd(dc.fts, q.tsq) + 0.5 * ts_rank(docs.meta, q.tsq) DESC
    LIMIT (SELECT n FROM pool)
  ),
  fused AS (
    SELECT coalesce(s.id, k.id) AS id,
           coalesce(1.0 / (60 + s.pos), 0) + coalesce(1.0 / (60 + k.pos), 0) AS score
    FROM semantic s
    FULL OUTER JOIN keyword k ON k.id = s.id
  )
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.page,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    docs.name AS document_name,
    docs.category AS document_category,
    docs.company AS document_company,
    docs.scope AS document_scope
  FROM fused f
  JOIN document_chunks dc ON dc.id = f.id
  JOIN docs ON docs.id = dc.document_id
  ORDER BY f.score DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_chunks(vector, float, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_hybrid(vector, text, float, int, text) TO service_role;

NOTIFY pgrst, 'reload schema';
