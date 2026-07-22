-- ============================================================
--  Migración: Notas de conocimiento
--  Permite guardar "conocimiento suelto" (reglas, trucos de
--  suscripción, recomendaciones por compañía) como documentos
--  de tipo 'nota', sin archivo físico asociado.
-- ============================================================

-- 1. Las notas no tienen archivo físico → file_path pasa a ser opcional.
ALTER TABLE documents ALTER COLUMN file_path DROP NOT NULL;

-- 2. Ampliar los tipos permitidos para incluir 'nota'.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'txt', 'nota'));

-- 3. Guardar el texto original de la nota (para poder mostrarlo/editarlo).
--    Los documentos con archivo dejan esta columna a NULL.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content text;
