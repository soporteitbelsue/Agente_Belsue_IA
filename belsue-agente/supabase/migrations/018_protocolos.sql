-- ============================================================
--  Migración: Protocolos de incorporación (pestaña "Protocolos")
--
--  Checklists por persona para llevar el control de la entrada
--  de nuevos empleados y nuevos colaboradores externos.
--
--  Todo lo que la oficina querrá retocar vive como DATOS, no en
--  el código:
--    - departments ........... departamentos de la oficina
--    - protocol_roles ........ responsables por defecto (roles, no personas)
--    - protocol_templates .... tipos de protocolo (una tarjeta cada uno)
--    - protocol_template_steps pasos de cada plantilla
--
--  Un protocolo nuevo (p. ej. "Baja") es una fila más en
--  protocol_templates con sus pasos: la pantalla saca las tarjetas
--  de ahí, sin cambiar estructura ni código.
--
--  Cada ficha copia el texto de sus pasos al crearse, para que
--  cambiar la plantilla después no altere fichas ya abiertas.
--
--  El historial (protocol_record_log) solo admite añadir: un
--  trigger impide modificarlo o borrarlo. La única excepción es
--  borrar una ficha entera (creada por error), que se lleva su
--  historial con ella y solo se hace con protocol_delete_record.
--
--  Las escrituras pasan por funciones SQL: el cliente de Supabase
--  no tiene transacciones, y así el cambio, su línea de historial
--  y el recálculo del estado van juntos o no va ninguno.
-- ============================================================

-- ------------------------------------------------------------
--  Departamentos
--
--  Hasta ahora eran una lista fija en la pantalla de Usuarios.
--  `key` es lo que se graba y lo que usan las condiciones de los
--  pasos; `name` se puede renombrar cuando se quiera.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name       text NOT NULL CHECK (btrim(name) <> ''),
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
--  Responsables (roles). Añadir uno = un INSERT.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_roles (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name       text NOT NULL CHECK (btrim(name) <> ''),
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
--  Plantillas y sus pasos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_templates (
  key              text PRIMARY KEY CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name             text NOT NULL CHECK (btrim(name) <> ''),
  description      text,
  -- true: al crear la ficha se pide el departamento (y los pasos con
  -- condición de departamento se filtran con él).
  asks_department  boolean NOT NULL DEFAULT false,
  -- Etiqueta de la fecha de la ficha ("Fecha de incorporación", "Fecha de baja"…).
  date_label       text NOT NULL DEFAULT 'Fecha de incorporación',
  position         int  NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS protocol_template_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key  text NOT NULL REFERENCES protocol_templates (key)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  position      int  NOT NULL,
  text          text NOT NULL CHECK (btrim(text) <> ''),
  help          text,
  default_role  text NOT NULL REFERENCES protocol_roles (key) ON UPDATE CASCADE,
  -- Condición opcional. Hoy se entiende:
  --   {"departments": ["produccion", ...]}  → solo si la ficha es de uno de esos
  -- NULL = el paso sale siempre.
  condition     jsonb,
  -- false: el paso no admite observaciones (p. ej. el reconocimiento médico,
  -- para que nadie apunte ahí datos de salud).
  allows_notes  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protocol_template_steps_tpl_idx
  ON protocol_template_steps (template_key, position);

-- ------------------------------------------------------------
--  Fichas
--
--  Los usuarios se guardan como id + nombre, sin clave foránea: la
--  ficha tiene que seguir diciendo quién la creó aunque esa persona
--  cambie de nombre o se dé de baja en la aplicación.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key     text NOT NULL REFERENCES protocol_templates (key) ON UPDATE CASCADE,
  person_name      text NOT NULL CHECK (btrim(person_name) <> ''),
  start_date       date NOT NULL,
  department_key   text REFERENCES departments (key) ON UPDATE CASCADE,
  status           text NOT NULL DEFAULT 'en_curso'
                     CHECK (status IN ('en_curso', 'completada')),
  completed_at     timestamptz,
  archived_at      timestamptz,
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protocol_records_tpl_idx
  ON protocol_records (template_key, status, start_date DESC);

CREATE TABLE IF NOT EXISTS protocol_record_steps (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id          uuid NOT NULL REFERENCES protocol_records (id) ON DELETE CASCADE,
  position           int  NOT NULL,
  -- Copias de la plantilla en el momento de crear la ficha.
  text               text NOT NULL,
  help               text,
  allows_notes       boolean NOT NULL DEFAULT true,
  -- Responsable de este paso en esta ficha (se puede cambiar sin tocar la plantilla).
  role_key           text NOT NULL REFERENCES protocol_roles (key) ON UPDATE CASCADE,
  completed          boolean NOT NULL DEFAULT false,
  completed_by       uuid,
  completed_by_name  text,
  completed_at       timestamptz,
  notes              text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protocol_record_steps_rec_idx
  ON protocol_record_steps (record_id, position);

-- ------------------------------------------------------------
--  Historial (solo añadir)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_record_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Orden real de los cambios (la hora puede empatar dentro de un mismo cambio).
  seq         bigint GENERATED ALWAYS AS IDENTITY,
  record_id   uuid NOT NULL REFERENCES protocol_records (id) ON DELETE CASCADE,
  step_id     uuid REFERENCES protocol_record_steps (id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN (
                'crear', 'marcar', 'desmarcar', 'cambiar_responsable',
                'observaciones', 'completar', 'reabrir',
                'archivar', 'desarchivar')),
  user_id     uuid,
  user_name   text,
  old_value   text,
  new_value   text,
  -- clock_timestamp y no now(): now() es fijo en toda la transacción y las
  -- líneas de un mismo cambio ("marcó…" y "quedó completada") empatarían.
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS protocol_record_log_rec_idx
  ON protocol_record_log (record_id, seq DESC);

CREATE OR REPLACE FUNCTION protocol_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Borrar solo dentro de protocol_delete_record (ficha creada por error).
  IF TG_OP = 'DELETE'
     AND current_setting('protocol.allow_log_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'El historial de protocolos no se puede modificar ni borrar.';
END;
$$;

DROP TRIGGER IF EXISTS protocol_record_log_append_only ON protocol_record_log;
CREATE TRIGGER protocol_record_log_append_only
  BEFORE UPDATE OR DELETE ON protocol_record_log
  FOR EACH ROW EXECUTE FUNCTION protocol_log_append_only();

-- ------------------------------------------------------------
--  Vista: fichas con su progreso (lista y contadores)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW protocol_record_summary AS
SELECT
  r.id,
  r.template_key,
  r.person_name,
  r.start_date,
  r.department_key,
  d.name AS department_name,
  r.status,
  r.completed_at,
  r.archived_at,
  r.created_by_name,
  r.created_at,
  count(s.id)::int                              AS total_steps,
  count(s.id) FILTER (WHERE s.completed)::int   AS done_steps
FROM protocol_records r
LEFT JOIN departments d           ON d.key = r.department_key
LEFT JOIN protocol_record_steps s ON s.record_id = r.id
GROUP BY r.id, d.name;

-- ------------------------------------------------------------
--  Funciones de escritura
-- ------------------------------------------------------------

-- Recalcula el estado de una ficha y deja constancia si cambia.
CREATE OR REPLACE FUNCTION protocol_refresh_status(
  p_record_id uuid, p_user_id uuid, p_user_name text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old  text;
  v_new  text;
BEGIN
  SELECT status INTO v_old FROM protocol_records WHERE id = p_record_id;

  SELECT CASE
           WHEN count(*) > 0 AND bool_and(completed) THEN 'completada'
           ELSE 'en_curso'
         END
    INTO v_new
    FROM protocol_record_steps WHERE record_id = p_record_id;

  IF v_new IS DISTINCT FROM v_old THEN
    UPDATE protocol_records
       SET status = v_new,
           completed_at = CASE WHEN v_new = 'completada' THEN now() END
     WHERE id = p_record_id;

    INSERT INTO protocol_record_log (record_id, action, user_id, user_name, old_value, new_value)
    VALUES (p_record_id,
            CASE WHEN v_new = 'completada' THEN 'completar' ELSE 'reabrir' END,
            p_user_id, p_user_name, v_old, v_new);
  END IF;
END;
$$;

-- Crea una ficha con su checklist sacado de la plantilla.
CREATE OR REPLACE FUNCTION protocol_create_record(
  p_template_key   text,
  p_person_name    text,
  p_start_date     date,
  p_department_key text,
  p_user_id        uuid,
  p_user_name      text
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tpl   protocol_templates%ROWTYPE;
  v_id    uuid;
  v_dept  text := NULLIF(btrim(coalesce(p_department_key, '')), '');
BEGIN
  SELECT * INTO v_tpl FROM protocol_templates WHERE key = p_template_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de protocolo desconocido: %', p_template_key;
  END IF;

  IF v_tpl.asks_department AND v_dept IS NULL THEN
    RAISE EXCEPTION 'El departamento es obligatorio para este protocolo.';
  END IF;
  IF NOT v_tpl.asks_department THEN
    v_dept := NULL;
  END IF;

  INSERT INTO protocol_records
    (template_key, person_name, start_date, department_key, created_by, created_by_name)
  VALUES
    (p_template_key, btrim(p_person_name), p_start_date, v_dept, p_user_id, p_user_name)
  RETURNING id INTO v_id;

  INSERT INTO protocol_record_steps (record_id, position, text, help, allows_notes, role_key)
  SELECT v_id,
         row_number() OVER (ORDER BY s.position, s.created_at),
         s.text, s.help, s.allows_notes, s.default_role
    FROM protocol_template_steps s
   WHERE s.template_key = p_template_key
     AND (
           s.condition IS NULL
        OR NOT (s.condition ? 'departments')
        OR (v_dept IS NOT NULL AND (s.condition -> 'departments') ? v_dept)
     );

  INSERT INTO protocol_record_log (record_id, action, user_id, user_name, new_value)
  VALUES (v_id, 'crear', p_user_id, p_user_name, btrim(p_person_name));

  RETURN v_id;
END;
$$;

-- Cambia un paso: marcado, responsable y/o observaciones.
-- Solo se toca lo que viene (p_completed / p_role_key no nulos, p_set_notes = true).
CREATE OR REPLACE FUNCTION protocol_update_step(
  p_step_id    uuid,
  p_completed  boolean,
  p_role_key   text,
  p_set_notes  boolean,
  p_notes      text,
  p_user_id    uuid,
  p_user_name  text
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_step      protocol_record_steps%ROWTYPE;
  v_notes     text := NULLIF(btrim(coalesce(p_notes, '')), '');
  v_old_role  text;
  v_new_role  text;
BEGIN
  SELECT * INTO v_step FROM protocol_record_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paso no encontrado.';
  END IF;

  -- Marcar / desmarcar
  IF p_completed IS NOT NULL AND p_completed IS DISTINCT FROM v_step.completed THEN
    UPDATE protocol_record_steps
       SET completed         = p_completed,
           completed_by      = CASE WHEN p_completed THEN p_user_id END,
           completed_by_name = CASE WHEN p_completed THEN p_user_name END,
           completed_at      = CASE WHEN p_completed THEN now() END,
           updated_at        = now()
     WHERE id = p_step_id;

    INSERT INTO protocol_record_log
      (record_id, step_id, action, user_id, user_name, old_value, new_value)
    VALUES
      (v_step.record_id, p_step_id,
       CASE WHEN p_completed THEN 'marcar' ELSE 'desmarcar' END,
       p_user_id, p_user_name,
       CASE WHEN v_step.completed THEN 'hecho' ELSE 'pendiente' END,
       CASE WHEN p_completed THEN 'hecho' ELSE 'pendiente' END);
  END IF;

  -- Responsable
  IF p_role_key IS NOT NULL AND p_role_key IS DISTINCT FROM v_step.role_key THEN
    SELECT name INTO v_new_role FROM protocol_roles WHERE key = p_role_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Responsable desconocido: %', p_role_key;
    END IF;
    SELECT name INTO v_old_role FROM protocol_roles WHERE key = v_step.role_key;

    UPDATE protocol_record_steps
       SET role_key = p_role_key, updated_at = now()
     WHERE id = p_step_id;

    INSERT INTO protocol_record_log
      (record_id, step_id, action, user_id, user_name, old_value, new_value)
    VALUES
      (v_step.record_id, p_step_id, 'cambiar_responsable',
       p_user_id, p_user_name, v_old_role, v_new_role);
  END IF;

  -- Observaciones
  IF p_set_notes AND v_notes IS DISTINCT FROM v_step.notes THEN
    IF NOT v_step.allows_notes THEN
      RAISE EXCEPTION 'Este paso no admite observaciones.';
    END IF;

    UPDATE protocol_record_steps
       SET notes = v_notes, updated_at = now()
     WHERE id = p_step_id;

    INSERT INTO protocol_record_log
      (record_id, step_id, action, user_id, user_name, old_value, new_value)
    VALUES
      (v_step.record_id, p_step_id, 'observaciones',
       p_user_id, p_user_name, v_step.notes, v_notes);
  END IF;

  PERFORM protocol_refresh_status(v_step.record_id, p_user_id, p_user_name);
  RETURN v_step.record_id;
END;
$$;

-- Archiva o desarchiva una ficha.
CREATE OR REPLACE FUNCTION protocol_set_archived(
  p_record_id uuid, p_archived boolean, p_user_id uuid, p_user_name text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_archived_at timestamptz;
BEGIN
  SELECT archived_at INTO v_archived_at
    FROM protocol_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficha no encontrada.';
  END IF;

  IF p_archived = (v_archived_at IS NOT NULL) THEN
    RETURN; -- ya estaba así
  END IF;

  UPDATE protocol_records
     SET archived_at = CASE WHEN p_archived THEN now() END
   WHERE id = p_record_id;

  INSERT INTO protocol_record_log (record_id, action, user_id, user_name)
  VALUES (p_record_id,
          CASE WHEN p_archived THEN 'archivar' ELSE 'desarchivar' END,
          p_user_id, p_user_name);
END;
$$;

-- Borra una ficha entera (creada por error) con su checklist y su historial.
CREATE OR REPLACE FUNCTION protocol_delete_record(p_record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted int;
BEGIN
  -- Solo para esta transacción: deja pasar el borrado del historial.
  PERFORM set_config('protocol.allow_log_delete', 'on', true);
  DELETE FROM protocol_records WHERE id = p_record_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  PERFORM set_config('protocol.allow_log_delete', 'off', true);
  RETURN v_deleted > 0;
END;
$$;

-- ------------------------------------------------------------
--  Seguridad (mismo criterio que 009 y 014)
--
--  La aplicación entra con la clave de servicio, que se salta RLS.
--  Sin políticas, RLS deniega todo lo demás. Los GRANT hacen falta
--  en el servidor de IONOS (ver deploy/ionos/README.md, "Permisos").
-- ------------------------------------------------------------
ALTER TABLE departments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_template_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_record_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_record_log      ENABLE ROW LEVEL SECURITY;

GRANT ALL ON departments, protocol_roles, protocol_templates,
             protocol_template_steps, protocol_records,
             protocol_record_steps, protocol_record_log
  TO anon, authenticated, service_role;

-- La secuencia de `seq` tampoco hereda permisos en el VPS.
GRANT USAGE, SELECT ON SEQUENCE protocol_record_log_seq_seq
  TO anon, authenticated, service_role;

ALTER VIEW protocol_record_summary SET (security_invoker = on);
REVOKE ALL ON protocol_record_summary FROM anon, authenticated;
GRANT SELECT ON protocol_record_summary TO service_role;

REVOKE EXECUTE ON FUNCTION
  protocol_refresh_status(uuid, uuid, text),
  protocol_create_record(text, text, date, text, uuid, text),
  protocol_update_step(uuid, boolean, text, boolean, text, uuid, text),
  protocol_set_archived(uuid, boolean, uuid, text),
  protocol_delete_record(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  protocol_refresh_status(uuid, uuid, text),
  protocol_create_record(text, text, date, text, uuid, text),
  protocol_update_step(uuid, boolean, text, boolean, text, uuid, text),
  protocol_set_archived(uuid, boolean, uuid, text),
  protocol_delete_record(uuid)
  TO service_role;

-- ============================================================
--  Semillas. ON CONFLICT DO NOTHING: volver a ejecutar el archivo
--  no duplica nada ni pisa cambios hechos después.
-- ============================================================

INSERT INTO departments (key, name, position) VALUES
  ('produccion',     'Producción',               0),
  ('contratacion',   'Contratación',             1),
  ('siniestros',     'Siniestros',               2),
  ('administracion', 'Administración',           3),
  ('direccion',      'Dirección',                4),
  ('tecnologico',    'Departamento Tecnológico', 5)
ON CONFLICT (key) DO NOTHING;

INSERT INTO protocol_roles (key, name, position) VALUES
  ('it',                       'IT',                          0),
  ('gerencia',                 'Gerencia',                    1),
  ('formador',                 'Formador',                    2),
  ('responsable_departamento', 'Responsable de departamento', 3),
  ('produccion',               'Producción',                  4)
ON CONFLICT (key) DO NOTHING;

INSERT INTO protocol_templates (key, name, description, asks_department, date_label, position) VALUES
  ('empleado',    'Nuevo empleado',
   'Alta de una persona que se incorpora a la plantilla de la oficina.',
   true,  'Fecha de incorporación', 0),
  ('colaborador', 'Nuevo colaborador externo',
   'Alta de un colaborador externo que trabaja con nuestras compañías.',
   false, 'Fecha de incorporación', 1)
ON CONFLICT (key) DO NOTHING;

-- Los pasos solo se siembran si la plantilla aún no tiene ninguno, para no
-- duplicarlos al reejecutar ni deshacer lo que se haya retocado a mano.
INSERT INTO protocol_template_steps
  (template_key, position, text, help, default_role, condition, allows_notes)
SELECT v.* FROM (VALUES
  ('colaborador', 1,
   'Recibir fichero de carteras o cargas de carteras a través de SIAPOL de las compañías con las que trabaja',
   NULL, 'produccion', NULL::jsonb, true),
  ('colaborador', 2,
   'Notificar nuevos códigos de las compañías con las que trabaja para que tenga acceso a ellas',
   NULL, 'produccion', NULL, true),
  ('colaborador', 3,
   'Preparar correo electrónico y comunicárselo al colaborador',
   NULL, 'it', NULL, true),
  ('colaborador', 4,
   'Usuario en eBroker como colaborador externo: pedir usuario, crear colaborador y crear usuario. Comunicárselo al colaborador',
   'Cargar las carteras desde el usuario del colaborador para que quede reflejado el dato de colaborador externo.',
   'it', NULL, true),
  ('colaborador', 5,
   'Preparar usuario de Avant2',
   NULL, 'it', NULL, true),
  ('colaborador', 6,
   'Informar de los procedimientos internos: aviso de emisiones a contratación, meter datos de contacto de los clientes, firma de protección de datos',
   NULL, 'gerencia', NULL, true),
  ('colaborador', 7,
   'Informar de los procedimientos sobre anulación de pólizas de clientes o cambio de vehículos',
   NULL, 'gerencia', NULL, true)
) AS v(template_key, position, text, help, default_role, condition, allows_notes)
WHERE NOT EXISTS (
  SELECT 1 FROM protocol_template_steps WHERE template_key = 'colaborador'
);

INSERT INTO protocol_template_steps
  (template_key, position, text, help, default_role, condition, allows_notes)
SELECT v.* FROM (VALUES
  ('empleado',  1, 'Crear correo electrónico',      NULL, 'it', NULL::jsonb, true),
  ('empleado',  2, 'Crear usuario de eBroker',      NULL, 'it', NULL, true),
  ('empleado',  3, 'Crear usuario de Avant2',
   'Solo para el departamento de Producción.',
   'it', '{"departments": ["produccion"]}'::jsonb, true),
  ('empleado',  4, 'Crear usuario de BelChat',      NULL, 'it', NULL, true),
  ('empleado',  5, 'Entregar documentación interna: Honorabilidad',        NULL, 'gerencia', NULL, true),
  ('empleado',  6, 'Entregar documentación interna: Protección de datos',  NULL, 'gerencia', NULL, true),
  ('empleado',  7, 'Entregar documentación interna: Prevención de riesgos', NULL, 'gerencia', NULL, true),
  ('empleado',  8, 'Formación eBroker / BelChat / Avant2',                 NULL, 'formador', NULL, true),
  ('empleado',  9, 'Formación sobre procedimientos internos según departamento',
   NULL, 'responsable_departamento', NULL, true),
  ('empleado', 10, 'Formación inicial nivel B',      NULL, 'gerencia', NULL, true),
  -- Solo hecho / no hecho y la fecha. Sin observaciones: aquí no se apuntan
  -- resultados ni datos médicos.
  ('empleado', 11, 'Reconocimiento médico inicial',
   'Marcar solo cuando se haya realizado. No se registran resultados ni documentos médicos.',
   'gerencia', NULL, false)
) AS v(template_key, position, text, help, default_role, condition, allows_notes)
WHERE NOT EXISTS (
  SELECT 1 FROM protocol_template_steps WHERE template_key = 'empleado'
);
