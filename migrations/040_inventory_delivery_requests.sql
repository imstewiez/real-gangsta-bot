-- Migration 40: inventory_delivery_requests
--
-- Entregas de bairrista passam a ser confirmadas por OG+ antes de mexerem
-- no ledger. Enquanto o pedido está pending, nada entra em inventory_movements
-- e portanto stock, rankings e promoções não mudam.

CREATE TABLE IF NOT EXISTS inventory_delivery_requests (
  id                     UUID PRIMARY KEY,
  requester_member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  requester_discord_id   TEXT NOT NULL,
  approver_discord_id    TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  lines                  JSONB NOT NULL,
  notes                  TEXT NOT NULL DEFAULT '',
  total_qty              INTEGER NOT NULL DEFAULT 0,
  total_value            NUMERIC(12,2) NOT NULL DEFAULT 0,
  movement_submission_id UUID NULL,
  decision_by            TEXT NULL,
  decision_reason        TEXT NOT NULL DEFAULT '',
  decided_at             TIMESTAMPTZ NULL,
  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_delivery_requests_approver_pending
  ON inventory_delivery_requests (approver_discord_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_inventory_delivery_requests_requester_created
  ON inventory_delivery_requests (requester_discord_id, created_at DESC);
