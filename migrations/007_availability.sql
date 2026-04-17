-- Migration 7: availability
-- Auto-extracted from dbMigrate.js

-- ── Sessões de disponibilidade diária ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS availability_sessions (
        id              SERIAL PRIMARY KEY,
        session_date    DATE NOT NULL,
        channel_id      TEXT NOT NULL,
        message_id      TEXT,
        created_by      TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        header_text     TEXT NOT NULL DEFAULT '',
        mention_role_ids TEXT NOT NULL DEFAULT '',
        slots_json      JSONB NOT NULL DEFAULT '[]',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at       TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_av_sess_date ON availability_sessions(session_date);
      CREATE INDEX IF NOT EXISTS idx_av_sess_channel ON availability_sessions(channel_id);
      CREATE INDEX IF NOT EXISTS idx_av_sess_status ON availability_sessions(status);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_av_sess_channel_date_open
        ON availability_sessions(channel_id, session_date) WHERE status = 'open';

      -- ── Slots/horários de cada sessão ───────────────────────────────────────
      CREATE TABLE IF NOT EXISTS availability_slots (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER NOT NULL REFERENCES availability_sessions(id) ON DELETE CASCADE,
        slot_label      TEXT NOT NULL,
        position        INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, slot_label)
      );
      CREATE INDEX IF NOT EXISTS idx_av_slots_session ON availability_slots(session_id);

      -- ── Votos por (slot, user) ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS availability_votes (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER NOT NULL REFERENCES availability_sessions(id) ON DELETE CASCADE,
        slot_id         INTEGER NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL,
        vote_state      TEXT NOT NULL CHECK (vote_state IN ('disponivel', 'indisponivel', 'talvez')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(slot_id, discord_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_av_votes_session ON availability_votes(session_id);
      CREATE INDEX IF NOT EXISTS idx_av_votes_slot ON availability_votes(slot_id);
      CREATE INDEX IF NOT EXISTS idx_av_votes_user ON availability_votes(discord_user_id);
