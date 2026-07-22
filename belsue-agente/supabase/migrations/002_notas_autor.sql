-- ============================================================
--  Migración: Autoría de las notas de conocimiento
--  Registra qué usuario (asesor o admin) creó cada nota/documento.
--  Los asesores también pueden aportar notas desde el chat.
-- ============================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
