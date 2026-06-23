-- ============================================================
--  Belsue Agente — Historial de conversaciones y métricas
-- ============================================================

-- Tabla de conversaciones
CREATE TABLE IF NOT EXISTS conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           text,
  message_count   integer NOT NULL DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_user_last_idx
  ON conversations (user_id, last_message_at DESC);

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  sources         jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_id, created_at ASC);

-- Vista de métricas agregadas por día (sin contenido de mensajes)
CREATE OR REPLACE VIEW conversation_metrics AS
SELECT
  DATE_TRUNC('day', c.created_at) AS day,
  COUNT(DISTINCT c.id) AS total_conversations,
  COUNT(DISTINCT c.user_id) AS active_users,
  SUM(c.message_count) AS total_messages,
  AVG(c.message_count) AS avg_messages_per_conversation
FROM conversations c
GROUP BY DATE_TRUNC('day', c.created_at)
ORDER BY day DESC;

-- Métricas por usuario (sin contenido)
CREATE OR REPLACE VIEW user_metrics AS
SELECT
  u.id AS user_id,
  u.name AS user_name,
  u.department,
  COUNT(DISTINCT c.id) AS total_conversations,
  COALESCE(SUM(c.message_count), 0) AS total_messages,
  MAX(c.last_message_at) AS last_active
FROM users u
LEFT JOIN conversations c ON c.user_id = u.id
GROUP BY u.id, u.name, u.department;
