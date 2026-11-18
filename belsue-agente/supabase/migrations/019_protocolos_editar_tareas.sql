-- ============================================================
--  Migración: editar y añadir tareas en Protocolos
--
--  1. En una ficha concreta: cambiar el texto de una tarea o
--     añadir una tarea extra solo para esa persona. Las dos cosas
--     quedan en el historial (acciones nuevas 'editar_texto' y
--     'anadir_paso').
--  2. En la plantilla: reordenar las tareas de una vez, en una
--     sola transacción (el resto de la edición de la plantilla son
--     altas, cambios y bajas sencillas de filas).
--
--  Editar la plantilla no toca las fichas ya creadas: cada ficha
--  tiene su propia copia de las tareas (ver migración 018).
-- ============================================================

-- Tareas añadidas a mano en una ficha (no venían de la plantilla).
ALTER TABLE protocol_record_steps
  ADD COLUMN IF NOT EXISTS is_extra boolean NOT NULL DEFAULT false;

-- Acciones nuevas del historial.
ALTER TABLE protocol_record_log
  DROP CONSTRAINT IF EXISTS protocol_record_log_action_check;
ALTER TABLE protocol_record_log
  ADD CONSTRAINT protocol_record_log_action_check CHECK (action IN (
    'crear', 'marcar', 'desmarcar', 'cambiar_responsable',
    'observaciones', 'completar', 'reabrir',
    'archivar', 'desarchivar',
    'editar_texto', 'anadir_paso'));

-- ------------------------------------------------------------
--  Ficha: cambiar el texto de una tarea
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protocol_edit_step_text(
  p_step_id uuid, p_text text, p_user_id uuid, p_user_name text
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_step protocol_record_steps%ROWTYPE;
  v_text text := btrim(coalesce(p_text, ''));
BEGIN
  IF v_text = '' THEN
    RAISE EXCEPTION 'El texto de la tarea no puede quedar vacío.';
  END IF;

  SELECT * INTO v_step FROM protocol_record_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada.';
  END IF;

  IF v_text IS DISTINCT FROM v_step.text THEN
    UPDATE protocol_record_steps
       SET text = v_text, updated_at = now()
     WHERE id = p_step_id;

    INSERT INTO protocol_record_log
      (record_id, step_id, action, user_id, user_name, old_value, new_value)
    VALUES
      (v_step.record_id, p_step_id, 'editar_texto',
       p_user_id, p_user_name, v_step.text, v_text);
  END IF;

  RETURN v_step.record_id;
END;
$$;

-- ------------------------------------------------------------
--  Ficha: añadir una tarea extra (al final)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protocol_add_step(
  p_record_id uuid, p_text text, p_role_key text, p_user_id uuid, p_user_name text
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_text text := btrim(coalesce(p_text, ''));
  v_pos  int;
  v_id   uuid;
BEGIN
  IF v_text = '' THEN
    RAISE EXCEPTION 'El texto de la tarea es obligatorio.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM protocol_roles WHERE key = p_role_key) THEN
    RAISE EXCEPTION 'Responsable desconocido: %', p_role_key;
  END IF;

  -- Bloquea la ficha: dos altas a la vez no se llevan el mismo número.
  PERFORM 1 FROM protocol_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficha no encontrada.';
  END IF;

  SELECT coalesce(max(position), 0) + 1 INTO v_pos
    FROM protocol_record_steps WHERE record_id = p_record_id;

  INSERT INTO protocol_record_steps (record_id, position, text, role_key, is_extra)
  VALUES (p_record_id, v_pos, v_text, p_role_key, true)
  RETURNING id INTO v_id;

  INSERT INTO protocol_record_log
    (record_id, step_id, action, user_id, user_name, new_value)
  VALUES
    (p_record_id, v_id, 'anadir_paso', p_user_id, p_user_name, v_text);

  -- Una ficha completada con una tarea nueva vuelve a estar en curso.
  PERFORM protocol_refresh_status(p_record_id, p_user_id, p_user_name);
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
--  Plantilla: reordenar todas las tareas de una vez
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protocol_reorder_template_steps(
  p_template_key text, p_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(*) INTO v_total
    FROM protocol_template_steps WHERE template_key = p_template_key;

  IF v_total <> coalesce(array_length(p_ids, 1), 0)
     OR v_total <> (SELECT count(*) FROM protocol_template_steps
                     WHERE template_key = p_template_key AND id = ANY (p_ids)) THEN
    RAISE EXCEPTION 'La plantilla ha cambiado mientras la editabas. Recarga la página.';
  END IF;

  UPDATE protocol_template_steps s
     SET position = o.ord
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, ord)
   WHERE s.id = o.id;
END;
$$;

-- ------------------------------------------------------------
--  Permisos (mismo criterio que 018)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  protocol_edit_step_text(uuid, text, uuid, text),
  protocol_add_step(uuid, text, text, uuid, text),
  protocol_reorder_template_steps(text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  protocol_edit_step_text(uuid, text, uuid, text),
  protocol_add_step(uuid, text, text, uuid, text),
  protocol_reorder_template_steps(text, uuid[])
  TO service_role;
