-- ============================================================
--  Migración: agenda de contactos editable
--
--  Los contactos de las compañías vivían en PDFs subidos como
--  documentos (TELÉFONOS DE CONTACTO, CONTACTOS_MAPFRE). Eso daba
--  dos problemas: no se podían corregir sin volver a exportar y
--  resubir el PDF, y la extracción de texto partía los correos por
--  los saltos de línea de la maquetación ("...DTBIL@z / urich.com"),
--  con lo que el agente podía dictar un email inválido.
--
--  Con una tabla, cada dato es un campo: ni se parte ni se descuadra.
--  El contenido se sigue indexando (un documento por compañía, para
--  no chocar con el tope de fragmentos por documento de retrieval.ts),
--  pero eso lo gestiona la aplicación, no esta migración.
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Compañía y departamento van separados: en el PDF venían pegados
  -- ("ZURICH ADMINISTRACION-CSM PARTICULARES") y así no se podía
  -- filtrar por compañía, que es como busca el equipo.
  company     text NOT NULL CHECK (btrim(company) <> ''),
  department  text,

  phone       text,
  phone2      text,
  mobile      text,
  email       text,

  address     text,
  city        text,
  postal_code text,
  province    text,

  -- Apuntes libres: horarios de atención, avisos, extensiones...
  notes       text,

  -- Hoy la pestaña vive en 'procedimientos', pero se guarda el ámbito
  -- para poder abrirla también al portal de seguros sin migrar otra vez.
  scope       text NOT NULL DEFAULT 'procedimientos'
              CHECK (scope IN ('seguros', 'procedimientos')),

  -- Edita todo el equipo, así que interesa saber quién tocó cada fila
  -- por última vez para poder rastrear un dato mal puesto.
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Orden natural del listado y del agrupado por compañía.
CREATE INDEX IF NOT EXISTS contacts_company_department_idx
  ON contacts (company, department);

-- El reindexado regenera un documento por compañía dentro de un ámbito.
CREATE INDEX IF NOT EXISTS contacts_scope_company_idx
  ON contacts (scope, company);

DROP TRIGGER IF EXISTS contacts_set_updated_at ON contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sin políticas: RLS deniega todo salvo a la clave de servicio, que es
-- con la que entra siempre la aplicación desde el servidor. Mismo
-- criterio que la migración 009.
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
