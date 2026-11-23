-- ============================================================
--  Migración: guardar la plantilla entera de una vez
--
--  El editor de plantillas pasa a trabajar en borrador: se edita,
--  añade, quita y reordena en pantalla, y nada se graba hasta
--  pulsar "Guardar cambios". Esta función recibe la lista completa
--  y la aplica en una sola transacción: o entra todo, o nada.
--
--  p_steps: array JSON en el orden final, cada elemento:
--    { "id": uuid | null,          -- null = tarea nueva
--      "text": "...", "help": "..." | null,
--      "default_role": "it", "allows_notes": true,
--      "departments": ["produccion"], -- vacío = todos
--      "subitems": "companias" | null }
--  Las tareas de la plantilla que no vengan en la lista se quitan.
--
--  Como siempre, las fichas ya creadas no cambian (tienen su copia).
-- ============================================================

CREATE OR REPLACE FUNCTION protocol_save_template_steps(
  p_template_key text, p_steps jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asks   boolean;
  v_el     jsonb;
  v_ord    int;
  v_id     uuid;
  v_text   text;
  v_role   text;
  v_depts  jsonb;
  v_cond   jsonb;
  v_sub    text;
BEGIN
  SELECT asks_department INTO v_asks FROM protocol_templates WHERE key = p_template_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plantilla no encontrada.';
  END IF;
  IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Lista de tareas inválida.';
  END IF;

  -- 1. Quitar las que ya no están.
  DELETE FROM protocol_template_steps
   WHERE template_key = p_template_key
     AND id NOT IN (
       SELECT (e ->> 'id')::uuid
         FROM jsonb_array_elements(p_steps) e
        WHERE nullif(e ->> 'id', '') IS NOT NULL
     );

  -- 2. Actualizar o crear cada una, con su posición final.
  FOR v_el, v_ord IN
    SELECT e, o FROM jsonb_array_elements(p_steps) WITH ORDINALITY AS t(e, o)
  LOOP
    v_text := btrim(coalesce(v_el ->> 'text', ''));
    IF v_text = '' THEN
      RAISE EXCEPTION 'La tarea % no tiene texto.', v_ord;
    END IF;

    v_role := v_el ->> 'default_role';
    IF NOT EXISTS (SELECT 1 FROM protocol_roles WHERE key = v_role) THEN
      RAISE EXCEPTION 'La tarea % no tiene un responsable válido.', v_ord;
    END IF;

    v_depts := coalesce(v_el -> 'departments', '[]'::jsonb);
    IF jsonb_typeof(v_depts) <> 'array' THEN
      RAISE EXCEPTION 'Departamentos inválidos en la tarea %.', v_ord;
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_depts) d
       WHERE NOT EXISTS (SELECT 1 FROM departments WHERE key = d)
    ) THEN
      RAISE EXCEPTION 'Departamento desconocido en la tarea %.', v_ord;
    END IF;
    v_cond := CASE
                WHEN v_asks AND jsonb_array_length(v_depts) > 0
                THEN jsonb_build_object('departments', v_depts)
              END;

    v_sub := nullif(v_el ->> 'subitems', '');
    IF v_sub IS NOT NULL AND v_sub <> 'companias' THEN
      RAISE EXCEPTION 'Lista desconocida en la tarea %.', v_ord;
    END IF;

    v_id := nullif(v_el ->> 'id', '')::uuid;

    IF v_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM protocol_template_steps
       WHERE id = v_id AND template_key = p_template_key
    ) THEN
      UPDATE protocol_template_steps
         SET position     = v_ord,
             text         = v_text,
             help         = nullif(btrim(coalesce(v_el ->> 'help', '')), ''),
             default_role = v_role,
             allows_notes = coalesce((v_el ->> 'allows_notes')::boolean, true),
             condition    = v_cond,
             subitems     = v_sub
       WHERE id = v_id;
    ELSE
      -- Nueva (o borrada mientras tanto por otra persona: se vuelve a crear).
      INSERT INTO protocol_template_steps
        (template_key, position, text, help, default_role, allows_notes, condition, subitems)
      VALUES
        (p_template_key, v_ord, v_text,
         nullif(btrim(coalesce(v_el ->> 'help', '')), ''),
         v_role, coalesce((v_el ->> 'allows_notes')::boolean, true), v_cond, v_sub);
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION protocol_save_template_steps(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION protocol_save_template_steps(text, jsonb)
  TO service_role;
