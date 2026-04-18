-- Migration 35: managed_topic_categories
-- Tabela para o bot persistir categorias de tópicos que AUTO-CRIOU quando as
-- configuradas (env var) encheram. Sem isto, cada restart perdia a referência
-- e o bot voltava a criar outra.
--
-- role:
--   'primary'        — a principal definida em env var BAIRRISTA_TOPICOS_CATEGORY_ID
--   'overflow-env'   — definida em env var BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS
--   'overflow-auto'  — criada automaticamente pelo bot quando as anteriores encheram
--
-- (Na prática só inserimos 'overflow-auto' — 'primary'/'overflow-env' são lidas
-- directamente do CONFIG em memória. Mantém-se o enum para futura migração.)

CREATE TABLE IF NOT EXISTS managed_topic_categories (
  id          SERIAL PRIMARY KEY,
  category_id TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'overflow-auto'
              CHECK (role IN ('primary', 'overflow-env', 'overflow-auto')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS ix_managed_topic_categories_role ON managed_topic_categories (role);
