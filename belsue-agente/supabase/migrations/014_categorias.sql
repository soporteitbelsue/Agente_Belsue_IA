-- ============================================================
--  Migración: las categorías dejan de estar escritas en el código
--
--  Las categorías (ramos en El Formador, áreas en Procedimientos)
--  vivían en `lib/scopes.ts`: añadir "Furgonetas" exigía tocar
--  código, compilar y desplegar. En la práctica eso significa que
--  la oficina no puede catalogar como necesita sin pedirlo fuera.
--
--  Con esta tabla se crean y se renombran desde Administración.
--
--  No hace falta migrar ni un documento: `documents.category` ya
--  era texto libre, sin clave foránea ni enum. Esta tabla dice qué
--  categorías se OFRECEN y cómo se llaman; el valor grabado en cada
--  documento sigue siendo el mismo texto de siempre. Y por eso
--  tampoco se pone una FK: un documento con una categoría que ya no
--  existe tiene que seguir viéndose (con su valor crudo), no
--  desaparecer ni impedir un borrado.
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Portal al que pertenece: las taxonomías son distintas y no se mezclan.
  scope    text NOT NULL CHECK (scope IN ('seguros', 'procedimientos')),

  -- Lo que se graba en `documents.category`. Inmutable a propósito: si
  -- cambiara habría que reescribir las filas de todos los documentos. Para
  -- corregir cómo se lee está `label`, que sí se puede cambiar cuando sea.
  value    text NOT NULL CHECK (value ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),

  -- Lo que ve el equipo ("Responsabilidad Civil").
  label    text NOT NULL CHECK (btrim(label) <> ''),

  -- Clave de la paleta de `lib/categories.ts`, no una clase de Tailwind:
  -- Tailwind borra en compilación las clases que no encuentra escritas, así
  -- que un color inventado desde el panel saldría sin color.
  color    text NOT NULL DEFAULT 'gris',

  -- Orden en los desplegables. Se renumera al reordenar desde el panel.
  position int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (scope, value)
);

CREATE INDEX IF NOT EXISTS categories_scope_idx ON categories (scope, position);

-- La aplicación entra siempre con la clave de servicio desde el servidor, que
-- se salta RLS. Sin políticas, RLS deniega todo lo demás (ver migración 009).
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Permisos explícitos: en el servidor de IONOS la base se restauró con
-- --no-privileges y los roles internos se arreglaron a mano tabla por tabla
-- (ver deploy/ionos/README.md, "Permisos"). Una tabla nueva no hereda aquello,
-- y sin esto PostgREST responde "permission denied for table categories".
-- Que aparezca `anon` no abre nada: RLS sigue denegando sin políticas.
GRANT ALL ON categories TO anon, authenticated, service_role;

-- ------------------------------------------------------------
--  Semilla: exactamente las categorías que había en el código, con
--  sus mismos colores. El día que esto se aplique, nada cambia.
-- ------------------------------------------------------------
INSERT INTO categories (scope, value, label, color, position) VALUES
  ('seguros', 'general',      'General',                  'belsue',    0),
  ('seguros', 'auto',         'Auto',                     'azul',      1),
  ('seguros', 'moto',         'Moto',                     'naranja',   2),
  ('seguros', 'hogar',        'Hogar',                    'verde',     3),
  ('seguros', 'vida',         'Vida',                     'morado',    4),
  ('seguros', 'salud',        'Salud',                    'rosa',      5),
  ('seguros', 'decesos',      'Decesos',                  'gris',      6),
  ('seguros', 'viaje',        'Asistencia en viaje',      'turquesa',  7),
  ('seguros', 'rc',           'Responsabilidad Civil',    'indigo',    8),

  ('procedimientos', 'general',      'General',                        'belsue',    0),
  ('procedimientos', 'organizacion', 'Organización y reparto de tareas','ambar',    1),
  ('procedimientos', 'atencion',     'Atención al cliente',            'celeste',   2),
  ('procedimientos', 'produccion',   'Nueva producción y cotizaciones','lima',      3),
  ('procedimientos', 'polizas',      'Gestión de pólizas',             'cian',      4),
  ('procedimientos', 'siniestros',   'Siniestros',                     'rojo',      5),
  ('procedimientos', 'cobros',       'Cobros e impagados',             'esmeralda', 6),
  ('procedimientos', 'herramientas', 'Herramientas y programas',       'violeta',   7),
  ('procedimientos', 'personal',     'Personal y horarios',            'coral',     8),
  ('procedimientos', 'normativa',    'Normativa y protección de datos','pizarra',   9)
ON CONFLICT (scope, value) DO NOTHING;

-- ------------------------------------------------------------
--  Cuántos documentos usa cada categoría.
--
--  Es lo que mira el panel antes de dejar borrar una: si hay
--  documentos dentro, borrarla los dejaría con una etiqueta
--  huérfana. Va como vista y no contando en la aplicación porque
--  ahí habría que traerse una fila por documento, y las consultas
--  de Supabase vienen paginadas: con el tiempo contaría de menos
--  sin que nadie se diera cuenta.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW category_usage AS
SELECT category AS value, count(*)::int AS total
FROM documents
WHERE category IS NOT NULL
GROUP BY category;

ALTER VIEW category_usage SET (security_invoker = on);
REVOKE ALL ON category_usage FROM anon, authenticated;
GRANT SELECT ON category_usage TO service_role;
