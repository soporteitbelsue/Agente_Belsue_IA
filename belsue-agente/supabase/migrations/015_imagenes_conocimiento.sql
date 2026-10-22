-- ============================================================
--  Migración: imágenes como conocimiento (JPG y PNG)
--
--  Capturas de pantalla, fotos de documentos, cuadros de
--  garantías... Al indexarlas, el modelo de visión transcribe y
--  describe su contenido (lib/parsers.ts) y eso es lo que se
--  trocea y se vectoriza, igual que el texto de un PDF.
--
--  Un .jpeg se guarda como 'jpg'.
-- ============================================================

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'txt', 'nota', 'pptx', 'video', 'jpg', 'png'));
