-- ============================================================
--  Migración: Huecos de conocimiento
--
--  Cuando el agente no sabe responder algo, hasta ahora solo se
--  enviaba un correo y la consulta se perdía. Guardadas, son la
--  mejor guía de qué material falta por subir: lo que se repite
--  varias veces es lo que urge cubrir.
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  scope      text NOT NULL DEFAULT 'seguros'
             CHECK (scope IN ('seguros', 'procedimientos')),
  question   text NOT NULL,
  answer     text,
  -- Se marca cuando ya se ha subido el material que faltaba.
  resolved   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_gaps_pending_idx
  ON knowledge_gaps (resolved, created_at DESC);
