-- ============================================================
--  Migración: Cursos en borrador
--
--  Un curso se prepara en varios ratos: se crea, se le suben las
--  lecciones, se ordenan. Mientras tanto no debería verlo el equipo.
--  Los cursos nuevos nacen sin publicar y se publican cuando están
--  listos; los que ya existían quedan publicados (default true).
-- ============================================================

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS courses_published_idx
  ON courses (scope, published, position);
