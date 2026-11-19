-- ============================================================
--  Migración: lista de compañías en "Accesos a las webs de
--  compañías y códigos"
--
--  - protocol_companies: las compañías con las que trabajamos y el
--    tipo de acceso a su web:
--      general    → las mismas credenciales para todos
--      particular → cada persona tiene su propio usuario
--    Se gestionan desde el panel (Protocolos → Compañías).
--
--  - Una tarea de plantilla puede llevar una sublista
--    (subitems = 'companias'). Al crear la ficha, esa tarea recibe
--    un check por compañía (protocol_record_substeps), con copia del
--    nombre y del tipo: cambiar la lista después no altera fichas.
--
--  - Marcar o desmarcar una compañía queda en el historial. Cuando
--    están todas marcadas, la tarea se marca sola; si se desmarca
--    una, la tarea vuelve a pendiente.
-- ============================================================

-- ------------------------------------------------------------
--  Compañías
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (btrim(name) <> ''),
  access_type  text NOT NULL CHECK (access_type IN ('general', 'particular')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Sin duplicados aunque cambien mayúsculas o espacios.
CREATE UNIQUE INDEX IF NOT EXISTS protocol_companies_name_uq
  ON protocol_companies (lower(btrim(name)));

-- ------------------------------------------------------------
--  Sublista en tareas de plantilla y de ficha
-- ------------------------------------------------------------
ALTER TABLE protocol_template_steps
  ADD COLUMN IF NOT EXISTS subitems text CHECK (subitems IN ('companias'));

ALTER TABLE protocol_record_steps
  ADD COLUMN IF NOT EXISTS subitems text CHECK (subitems IN ('companias'));

CREATE TABLE IF NOT EXISTS protocol_record_substeps (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id            uuid NOT NULL REFERENCES protocol_record_steps (id) ON DELETE CASCADE,
  position           int  NOT NULL,
  -- Copias en el momento de cargarlas (nombre de la compañía y tipo).
  label              text NOT NULL,
  detail             text,
  completed          boolean NOT NULL DEFAULT false,
  completed_by       uuid,
  completed_by_name  text,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protocol_record_substeps_step_idx
  ON protocol_record_substeps (step_id, position);

-- Acciones nuevas del historial.
ALTER TABLE protocol_record_log
  DROP CONSTRAINT IF EXISTS protocol_record_log_action_check;
ALTER TABLE protocol_record_log
  ADD CONSTRAINT protocol_record_log_action_check CHECK (action IN (
    'crear', 'marcar', 'desmarcar', 'cambiar_responsable',
    'observaciones', 'completar', 'reabrir',
    'archivar', 'desarchivar',
    'editar_texto', 'anadir_paso',
    'marcar_compania', 'desmarcar_compania', 'cargar_companias'));

-- La tarea de accesos de "Nuevo empleado" lleva la lista de compañías.
UPDATE protocol_template_steps
   SET subitems = 'companias'
 WHERE template_key = 'empleado'
   AND text = 'Accesos a las webs de compañías y códigos'
   AND subitems IS NULL;

-- Fichas ya creadas: su tarea de accesos también la admite. La lista se
-- carga desde la propia ficha con "Cargar compañías".
UPDATE protocol_record_steps s
   SET subitems = 'companias'
  FROM protocol_records r
 WHERE r.id = s.record_id
   AND r.template_key = 'empleado'
   AND s.text = 'Accesos a las webs de compañías y códigos'
   AND s.subitems IS NULL;

-- ------------------------------------------------------------
--  Carga en una tarea las compañías que le falten (al final).
--  Devuelve cuántas ha añadido.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protocol_sync_substeps(
  p_step_id uuid, p_user_id uuid, p_user_name text, p_log boolean DEFAULT true
) RETURNS int
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_step   protocol_record_steps%ROWTYPE;
  v_start  int;
  v_added  int;
  v_names  text;
BEGIN
  SELECT * INTO v_step FROM protocol_record_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada.';
  END IF;
  IF v_step.subitems IS DISTINCT FROM 'companias' THEN
    RAISE EXCEPTION 'Esta tarea no lleva lista de compañías.';
  END IF;

  SELECT coalesce(max(position), 0) INTO v_start
    FROM protocol_record_substeps WHERE step_id = p_step_id;

  WITH nuevas AS (
    SELECT c.name, c.access_type,
           row_number() OVER (ORDER BY lower(c.name)) AS n
      FROM protocol_companies c
     WHERE NOT EXISTS (
       SELECT 1 FROM protocol_record_substeps x
        WHERE x.step_id = p_step_id
          AND lower(btrim(x.label)) = lower(btrim(c.name))
     )
  ), ins AS (
    INSERT INTO protocol_record_substeps (step_id, position, label, detail)
    SELECT p_step_id, v_start + n, name, access_type FROM nuevas
    RETURNING label
  )
  SELECT count(*), string_agg(label, ', ' ORDER BY label) INTO v_added, v_names FROM ins;

  IF v_added > 0 AND p_log THEN
    INSERT INTO protocol_record_log
      (record_id, step_id, action, user_id, user_name, new_value)
    VALUES
      (v_step.record_id, p_step_id, 'cargar_companias', p_user_id, p_user_name, v_names);
  END IF;

  -- Compañías nuevas en una tarea ya hecha: vuelve a pendiente.
  IF v_added > 0 AND v_step.completed THEN
    PERFORM protocol_update_step(p_step_id, false, NULL, false, NULL, p_user_id, p_user_name);
  END IF;

  RETURN v_added;
END;
$$;

-- ------------------------------------------------------------
--  Marca o desmarca una compañía. La tarea sigue a la sublista:
--  todas marcadas → hecha; alguna sin marcar → pendiente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protocol_toggle_substep(
  p_substep_id uuid, p_completed boolean, p_user_id uuid, p_user_name text
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub       protocol_record_substeps%ROWTYPE;
  v_step      protocol_record_steps%ROWTYPE;
  v_all_done  boolean;
BEGIN
  SELECT * INTO v_sub FROM protocol_record_substeps WHERE id = p_substep_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compañía no encontrada en la ficha.';
  END IF;
  SELECT * INTO v_step FROM protocol_record_steps WHERE id = v_sub.step_id FOR UPDATE;

  IF p_completed IS DISTINCT FROM v_sub.completed THEN
    UPDATE protocol_record_substeps
       SET completed         = p_completed,
           completed_by      = CASE WHEN p_completed THEN p_user_id END,
           completed_by_name = CASE WHEN p_completed THEN p_user_name END,
           completed_at      = CASE WHEN p_completed THEN now() END
     WHERE id = p_substep_id;

    INSERT INTO protocol_record_log
      (record_id, step_id, action, user_id, user_name, new_value)
    VALUES
      (v_step.record_id, v_step.id,
       CASE WHEN p_completed THEN 'marcar_compania' ELSE 'desmarcar_compania' END,
       p_user_id, p_user_name, v_sub.label);
  END IF;

  SELECT bool_and(completed) INTO v_all_done
    FROM protocol_record_substeps WHERE step_id = v_step.id;

  IF v_all_done AND NOT v_step.completed THEN
    PERFORM protocol_update_step(v_step.id, true, NULL, false, NULL, p_user_id, p_user_name);
  ELSIF NOT v_all_done AND v_step.completed THEN
    PERFORM protocol_update_step(v_step.id, false, NULL, false, NULL, p_user_id, p_user_name);
  END IF;

  RETURN v_step.record_id;
END;
$$;

-- ------------------------------------------------------------
--  protocol_create_record: igual que en 018, más la copia de
--  `subitems` y la carga de las compañías en esas tareas.
-- ------------------------------------------------------------
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
  v_sub   uuid;
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

  INSERT INTO protocol_record_steps
    (record_id, position, text, help, allows_notes, role_key, subitems)
  SELECT v_id,
         row_number() OVER (ORDER BY s.position, s.created_at),
         s.text, s.help, s.allows_notes, s.default_role, s.subitems
    FROM protocol_template_steps s
   WHERE s.template_key = p_template_key
     AND (
           s.condition IS NULL
        OR NOT (s.condition ? 'departments')
        OR (v_dept IS NOT NULL AND (s.condition -> 'departments') ? v_dept)
     );

  INSERT INTO protocol_record_log (record_id, action, user_id, user_name, new_value)
  VALUES (v_id, 'crear', p_user_id, p_user_name, btrim(p_person_name));

  -- Sublistas: se cargan sin línea de historial (forman parte de "creó la ficha").
  FOR v_sub IN
    SELECT id FROM protocol_record_steps WHERE record_id = v_id AND subitems = 'companias'
  LOOP
    PERFORM protocol_sync_substeps(v_sub, p_user_id, p_user_name, false);
  END LOOP;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
--  Seguridad (mismo criterio que 018)
-- ------------------------------------------------------------
ALTER TABLE protocol_companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_record_substeps ENABLE ROW LEVEL SECURITY;

GRANT ALL ON protocol_companies, protocol_record_substeps
  TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION
  protocol_sync_substeps(uuid, uuid, text, boolean),
  protocol_toggle_substep(uuid, boolean, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  protocol_sync_substeps(uuid, uuid, text, boolean),
  protocol_toggle_substep(uuid, boolean, uuid, text)
  TO service_role;
