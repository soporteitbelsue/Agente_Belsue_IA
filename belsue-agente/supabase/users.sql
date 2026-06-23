-- ============================================================
--  Belsue Agente — Tabla de usuarios (autenticación NextAuth)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'asesor' CHECK (role IN ('asesor', 'admin')),
  department    text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  last_login    timestamptz
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
