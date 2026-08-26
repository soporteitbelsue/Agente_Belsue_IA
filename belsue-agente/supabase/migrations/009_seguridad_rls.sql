-- ============================================================
--  Migración: cerrar el acceso público a la base de datos
--
--  Supabase avisó de tablas accesibles públicamente. Comprobado
--  con la clave pública que va en el navegador (la misma que usa
--  la subida de archivos):
--
--    - courses, lessons y lesson_views se leían enteras, y además
--      admitían PATCH y DELETE.
--    - Las vistas de métricas, al ser SECURITY DEFINER, se saltaban
--      el RLS de las tablas de debajo y publicaban nombre,
--      departamento y actividad de cada persona.
--
--  La aplicación entra SIEMPRE con la clave de servicio desde el
--  servidor, que se salta RLS, así que esto no le afecta. La clave
--  pública solo se usa para subir archivos a Storage.
-- ============================================================

-- 1. Tablas creadas sin RLS. Sin políticas, RLS deniega todo salvo a
--    la clave de servicio, que es justo lo que queremos.
ALTER TABLE courses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_views   ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_gaps ENABLE ROW LEVEL SECURITY;

-- 2. Vistas de métricas: que respeten los permisos de quien consulta.
ALTER VIEW conversation_metrics SET (security_invoker = on);
ALTER VIEW user_metrics SET (security_invoker = on);

REVOKE ALL ON conversation_metrics FROM anon, authenticated;
REVOKE ALL ON user_metrics FROM anon, authenticated;

-- 3. Funciones con search_path fijo, para que no herede el de quien llama.
ALTER FUNCTION set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION match_chunks(vector, float, int, text) SET search_path = public, pg_temp;
