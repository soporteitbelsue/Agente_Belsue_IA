-- ============================================================
--  Migración: reseteo y cambio de contraseña
--
--  Hasta ahora la contraseña se fijaba al crear el usuario y no
--  había forma de cambiarla: quien la olvidaba se quedaba fuera
--  y sólo se recuperaba tocando password_hash a mano en la base.
--
--  Se añaden dos campos:
--
--    - must_change_password: lo pone a true un reseteo hecho por
--      administración. Mientras esté activo, el middleware manda
--      al usuario a /cuenta/contrasena y no le deja ir a ninguna
--      otra página. Así la contraseña temporal que se comunica
--      por teléfono o en persona no se queda puesta para siempre.
--
--    - password_changed_at: cuándo se cambió por última vez.
--      Sólo informativo, para poder ver en el panel quién sigue
--      con la contraseña que se le puso el primer día.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at  timestamptz;
