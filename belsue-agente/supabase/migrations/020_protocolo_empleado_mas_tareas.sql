-- ============================================================
--  Migración: más tareas en el protocolo "Nuevo empleado"
--
--  Añade lo que faltaba (equipo, carpetas, firma y MFA, accesos a
--  compañías, Wilfredo, bandeja de BelChat, llaves/alarma e
--  inventario de accesos de la auditoría) y reordena la plantilla
--  para que las tareas sigan el orden natural de una incorporación.
--
--  Solo afecta a las fichas que se creen a partir de ahora. Se puede
--  ejecutar más de una vez: no duplica tareas.
-- ============================================================

-- 1. Tareas nuevas (solo si aún no están, comparando por texto).
INSERT INTO protocol_template_steps
  (template_key, position, text, help, default_role, condition, allows_notes)
SELECT 'empleado', 0, v.text, v.help, v.role, v.cond, true
FROM (VALUES
  ('Preparar equipo: ordenador, extensión o teléfono e impresora',
   NULL, 'it', NULL::jsonb),
  ('Firma de correo, alta en grupos o listas de distribución y MFA activado',
   NULL, 'it', NULL),
  ('Acceso a carpetas compartidas o servidor',
   'Según el departamento.', 'it', NULL),
  ('Accesos a las webs de compañías y códigos',
   'Solo para el departamento de Producción.', 'produccion',
   '{"departments": ["produccion"]}'::jsonb),
  ('Crear usuario de Wilfredo',
   'Solo si va a tarificar. Si no aplica, márcalo y anota «No aplica» en observaciones.',
   'it', NULL),
  ('BelChat: asignarle departamento y bandeja',
   NULL, 'it', NULL),
  ('Entregar llaves o código de alarma',
   'Si aplica. Si no, márcalo y anota «No aplica» en observaciones.',
   'gerencia', NULL),
  ('Dar de alta en el inventario de accesos de la auditoría',
   'Para que quede registrado qué accesos y equipos tiene cada persona.',
   'it', NULL)
) AS v(text, help, role, cond)
WHERE NOT EXISTS (
  SELECT 1 FROM protocol_template_steps s
   WHERE s.template_key = 'empleado' AND s.text = v.text
);

-- 2. Orden nuevo. Las tareas que no estén en esta lista (por ejemplo,
--    añadidas desde el panel) se quedan al final, en su orden de antes.
UPDATE protocol_template_steps s
   SET position = 1000 + s.position
 WHERE s.template_key = 'empleado';

UPDATE protocol_template_steps s
   SET position = d.ord
  FROM (VALUES
    ('Preparar equipo: ordenador, extensión o teléfono e impresora',             1),
    ('Crear correo electrónico',                                                 2),
    ('Firma de correo, alta en grupos o listas de distribución y MFA activado',  3),
    ('Acceso a carpetas compartidas o servidor',                                 4),
    ('Crear usuario de eBroker',                                                 5),
    ('Crear usuario de Avant2',                                                  6),
    ('Accesos a las webs de compañías y códigos',                                7),
    ('Crear usuario de Wilfredo',                                                8),
    ('Crear usuario de BelChat',                                                 9),
    ('BelChat: asignarle departamento y bandeja',                               10),
    ('Entregar llaves o código de alarma',                                      11),
    ('Entregar documentación interna: Honorabilidad',                           12),
    ('Entregar documentación interna: Protección de datos',                     13),
    ('Entregar documentación interna: Prevención de riesgos',                   14),
    ('Formación eBroker / BelChat / Avant2',                                    15),
    ('Formación sobre procedimientos internos según departamento',              16),
    ('Formación inicial nivel B',                                               17),
    ('Reconocimiento médico inicial',                                           18),
    ('Dar de alta en el inventario de accesos de la auditoría',                 19)
  ) AS d(text, ord)
 WHERE s.template_key = 'empleado' AND s.text = d.text;

-- 3. Renumera 1..N sin huecos (las que no estaban en la lista van detrás).
UPDATE protocol_template_steps s
   SET position = o.n
  FROM (
    SELECT id, row_number() OVER (ORDER BY position, created_at) AS n
      FROM protocol_template_steps
     WHERE template_key = 'empleado'
  ) o
 WHERE s.id = o.id;
