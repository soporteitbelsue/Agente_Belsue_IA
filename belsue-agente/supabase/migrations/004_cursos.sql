-- ============================================================
--  Migración: Sección de cursos (formación interna)
--
--  Vive dentro del portal 'procedimientos'. Un curso es una lista
--  ordenada de lecciones, y cada lección apunta a un documento ya
--  subido (PPTX o PDF), que se indexa como cualquier otro para que
--  el agente pueda responder citando la lección concreta.
-- ============================================================

-- 1. Los PowerPoint pasan a ser un tipo de archivo admitido.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'txt', 'nota', 'pptx'));

-- 2. Cursos
CREATE TABLE IF NOT EXISTS courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  -- Ámbito al que pertenece. Hoy solo se usan cursos en 'procedimientos',
  -- pero se guarda para poder abrirlos a otros portales sin migrar de nuevo.
  scope       text NOT NULL DEFAULT 'procedimientos'
              CHECK (scope IN ('seguros', 'procedimientos')),
  -- Orden manual en el listado; a igualdad, se ordena por fecha.
  position    integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courses_scope_position_idx
  ON courses (scope, position, created_at);

DROP TRIGGER IF EXISTS courses_set_updated_at ON courses;
CREATE TRIGGER courses_set_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Lecciones
--    Borrar el documento borra la lección: no tiene sentido una lección
--    sin material. Borrar el curso arrastra sus lecciones (pero no los
--    documentos, que siguen disponibles en el portal).
CREATE TABLE IF NOT EXISTS lessons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Un mismo documento no se repite dentro del mismo curso.
CREATE UNIQUE INDEX IF NOT EXISTS lessons_course_document_idx
  ON lessons (course_id, document_id);

CREATE INDEX IF NOT EXISTS lessons_course_position_idx
  ON lessons (course_id, position, created_at);

-- Permite localizar la lección de un documento al indexarlo (para la
-- cabecera que cita curso y lección).
CREATE INDEX IF NOT EXISTS lessons_document_idx ON lessons (document_id);

-- 4. Seguimiento: qué lecciones ha visto cada persona.
CREATE TABLE IF NOT EXISTS lesson_views (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS lesson_views_lesson_idx ON lesson_views (lesson_id);
