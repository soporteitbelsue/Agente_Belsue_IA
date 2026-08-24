-- ============================================================
--  Migración: Lecciones en vídeo
--
--  Los vídeos se alojan fuera (YouTube) y aquí solo se guarda su
--  enlace: subirlos ocuparía todo el espacio de Storage y el plan
--  gratuito no da para eso.
--
--  Se modela como un documento más: file_path guarda la URL y
--  content la descripción. Así entra en el catálogo, se indexa por
--  su descripción y puede ser lección de un curso sin tocar la
--  tabla `lessons`.
-- ============================================================

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'txt', 'nota', 'pptx', 'video'));
