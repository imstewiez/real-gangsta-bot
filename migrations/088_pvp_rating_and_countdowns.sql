-- Migration 088: pvp_rating_and_countdowns
-- Tabelas de rating PvP e countdowns de saída

-- ── PvP Ratings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_pvp_ratings (
  id                BIGSERIAL PRIMARY KEY,
  member_id         INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rating            INTEGER NOT NULL DEFAULT 1000,
  total_sessions    INTEGER NOT NULL DEFAULT 0,
  tier              TEXT NOT NULL DEFAULT 'E',
  best_rating       INTEGER NOT NULL DEFAULT 1000,
  worst_rating      INTEGER NOT NULL DEFAULT 1000,
  streak_current    INTEGER NOT NULL DEFAULT 0,
  streak_type       TEXT,
  last_session_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_member_pvp_rating UNIQUE (member_id)
);

CREATE INDEX IF NOT EXISTS idx_pvp_rating ON member_pvp_ratings(rating DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_tier ON member_pvp_ratings(tier, rating DESC);

-- Trigger auto-update updated_at (reusa função genérica do mig 050)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_member_pvp_ratings_updated_at'
  ) THEN
    CREATE TRIGGER trg_member_pvp_ratings_updated_at
    BEFORE UPDATE ON member_pvp_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── Saída Countdowns ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saida_countdowns (
  id              BIGSERIAL PRIMARY KEY,
  saida_id        INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  countdown_type  TEXT NOT NULL,
  fire_at         TIMESTAMPTZ NOT NULL,
  cancelled       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_saida_countdown UNIQUE (saida_id, countdown_type)
);

CREATE INDEX IF NOT EXISTS idx_saida_countdowns_fire ON saida_countdowns(fire_at)
  WHERE cancelled = FALSE;

-- Trigger auto-update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_saida_countdowns_updated_at'
  ) THEN
    CREATE TRIGGER trg_saida_countdowns_updated_at
    BEFORE UPDATE ON saida_countdowns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
