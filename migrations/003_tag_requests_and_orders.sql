-- Migration 3: tag_requests_and_orders
-- Auto-extracted from dbMigrate.js

-- ── Tag requests (onboarding approval) ─────────────────────────────────
      CREATE TABLE IF NOT EXISTS tag_requests (
        id              SERIAL PRIMARY KEY,
        discord_id      TEXT NOT NULL,
        username        TEXT NOT NULL DEFAULT '',
        full_name       TEXT NOT NULL,
        nickname        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
        approved_by     TEXT,
        denied_by       TEXT,
        deny_reason     TEXT DEFAULT '',
        message_id      TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_tr_discord ON tag_requests(discord_id);
      CREATE INDEX IF NOT EXISTS idx_tr_status ON tag_requests(status);

      -- ── Orders (encomendas de moradores) ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS orders (
        id              SERIAL PRIMARY KEY,
        member_id       INTEGER NOT NULL REFERENCES members(id),
        item_id         INTEGER NOT NULL REFERENCES items(id),
        quantity        INTEGER NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'denied', 'cancelled')),
        notes           TEXT DEFAULT '',
        approved_by     TEXT,
        fulfilled_by    TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(member_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      -- ── Add material_source to operation_participants ──────────────────────
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS material_source TEXT DEFAULT 'proprio' CHECK (material_source IN ('proprio', 'org'));
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS material_returned_qty INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS material_lost_qty INTEGER DEFAULT 0;

      -- ── Add nickname to members ────────────────────────────────────────────
      ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT '';
      ALTER TABLE members ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
