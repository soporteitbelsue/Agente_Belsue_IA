-- ============================================================
--  Migración: recuperar el fax en la agenda de contactos
--
--  La 011 lo omitió por considerarlo en desuso. Al volcar el
--  export completo de Ebroker resultó que 26 de los 365 contactos
--  tienen fax, y varios existen solo por eso (entradas llamadas
--  "X-FAX GENERALI", "X-FAX MAPFRE"...). Se recupera para no
--  perder dato al importar.
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fax text;
