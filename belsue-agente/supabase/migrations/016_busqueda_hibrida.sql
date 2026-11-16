-- 016 · Búsqueda híbrida (significado + palabras exactas) y batería de evaluación
--
-- La búsqueda por embeddings encuentra lo que se PARECE a la pregunta, pero
-- falla con nombres, códigos y cifras exactas ("AUTO_QUALITAS", "franquicia
-- 300", el nombre de una garantía): para un embedding, todos los condicionados
-- de hogar se parecen. La búsqueda de texto completo de Postgres acierta justo
-- ahí. Se combinan las dos listas con Reciprocal Rank Fusion (RRF): cuenta la
-- POSICIÓN en cada lista, no la puntuación, así que no hay que calibrar
-- escalas distintas.
--
-- Aplicar en el VPS:
--   cd /opt/belsue/supabase
--   docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 \
--     < /opt/belsue/app/belsue-agente/supabase/migrations/016_busqueda_hibrida.sql
--
-- Se puede relanzar sin miedo.

-- 1. Texto normalizado: minúsculas y sin tildes, para que "póliza" y "poliza"
--    coincidan. translate() es inmutable y no necesita la extensión unaccent.
CREATE OR REPLACE FUNCTION belsue_normaliza(t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT translate(lower(coalesce(t, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc');
$$;

-- 2. Índice de texto completo de cada fragmento (en español: quita palabras
--    vacías y reduce cada palabra a su raíz, "cubre" ≈ "cubierto").
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('spanish', belsue_normaliza(content))) STORED;

CREATE INDEX IF NOT EXISTS document_chunks_fts_idx
  ON document_chunks USING gin (fts);

-- 3. Búsqueda híbrida. Devuelve las mismas columnas que match_chunks, para que
--    el código las trate igual.
--
--    · Lista semántica: los `pool` fragmentos más parecidos (con el umbral).
--    · Lista de palabras: los `pool` fragmentos que contienen ALGUNA de las
--      palabras de la pregunta (OR, no AND: una pregunta natural nunca tiene
--      todas sus palabras en el mismo párrafo), ordenados por relevancia. Si
--      además el título, compañía o categoría del documento contienen las
--      palabras ("Mapfre", "hogar"), suben: casi ningún fragmento de un
--      condicionado repite el nombre de su compañía.
--    · Fusión: 1/(60 + posición) en cada lista, sumado.
CREATE OR REPLACE FUNCTION match_chunks_hybrid(
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
    -- plainto_tsquery une con AND (&); se cambia a OR (|). Si la pregunta solo
    -- tiene palabras vacías, la consulta queda vacía y la lista no aporta nada.
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

GRANT EXECUTE ON FUNCTION belsue_normaliza(text) TO service_role;
GRANT EXECUTE ON FUNCTION match_chunks_hybrid(vector, text, float, int, text) TO service_role;

-- 4. Batería de evaluación: preguntas con el documento que debería salir.
--    `origen` = 'sintetica' (generada a partir de un fragmento) o 'real'
--    (escrita a mano a partir de consultas del equipo).
CREATE TABLE IF NOT EXISTS eval_questions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question             text NOT NULL,
  expected_document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_chunk_id      uuid REFERENCES document_chunks(id) ON DELETE SET NULL,
  origen               text NOT NULL DEFAULT 'sintetica',
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Como el resto de tablas (migración 009): RLS sin políticas, solo la clave
-- de servicio entra.
ALTER TABLE eval_questions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON eval_questions TO service_role;

-- 5. Que la API (PostgREST) vea ya la función y la tabla nuevas.
NOTIFY pgrst, 'reload schema';
