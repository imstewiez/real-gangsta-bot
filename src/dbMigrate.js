'use strict';
const { pool } = require('./db');

const MIGRATIONS = [
  {
    id: 1,
    name: 'initial_schema',
    up: `
      -- ── Bot state (key-value) ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS bot_state (
        key   TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Members ─────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS members (
        id              SERIAL PRIMARY KEY,
        discord_id      TEXT NOT NULL UNIQUE,
        username        TEXT NOT NULL DEFAULT '',
        display_name    TEXT NOT NULL DEFAULT '',
        role            TEXT NOT NULL DEFAULT 'morador' CHECK (role IN ('morador', 'oficial', 'chefia', 'chefe_moradores', 'inativo')),
        status          TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'arquivado')),
        channel_id      TEXT,
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        promoted_at     TIMESTAMPTZ,
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_members_discord_id ON members(discord_id);
      CREATE INDEX IF NOT EXISTS idx_members_role ON members(role);
      CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

      -- ── Member role history ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS member_role_history (
        id          SERIAL PRIMARY KEY,
        member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        old_role    TEXT,
        new_role    TEXT NOT NULL,
        changed_by  TEXT NOT NULL,
        reason      TEXT DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mrh_member ON member_role_history(member_id);

      -- ── Resident channels ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS resident_channels (
        id              SERIAL PRIMARY KEY,
        member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        discord_id      TEXT NOT NULL,
        channel_id      TEXT NOT NULL UNIQUE,
        channel_name    TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
        category_id     TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        archived_at     TIMESTAMPTZ,
        deleted_at      TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_rc_member ON resident_channels(member_id);
      CREATE INDEX IF NOT EXISTS idx_rc_discord ON resident_channels(discord_id);
      CREATE INDEX IF NOT EXISTS idx_rc_status ON resident_channels(status);

      -- ── Items catalog ───────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS items (
        id              SERIAL PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        category        TEXT NOT NULL DEFAULT 'outros',
        unit            TEXT NOT NULL DEFAULT 'unidade',
        estimated_value NUMERIC(12,2),
        active          BOOLEAN NOT NULL DEFAULT TRUE,
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
      CREATE INDEX IF NOT EXISTS idx_items_active ON items(active);

      -- ── Inventory movements ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id              SERIAL PRIMARY KEY,
        movement_type   TEXT NOT NULL CHECK (movement_type IN (
          'entrega_morador', 'venda_morador', 'entrega_oficial',
          'fornecimento_org', 'consumo_operacao', 'devolucao_operacao',
          'ajuste_manual', 'perda_operacao', 'apreendido', 'craftado'
        )),
        item_id         INTEGER NOT NULL REFERENCES items(id),
        quantity        INTEGER NOT NULL,
        member_id       INTEGER REFERENCES members(id),
        member_role     TEXT,
        origin          TEXT DEFAULT '',
        destination     TEXT DEFAULT '',
        context         TEXT DEFAULT '',
        notes           TEXT DEFAULT '',
        operation_id    INTEGER,
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_im_item ON inventory_movements(item_id);
      CREATE INDEX IF NOT EXISTS idx_im_member ON inventory_movements(member_id);
      CREATE INDEX IF NOT EXISTS idx_im_type ON inventory_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_im_operation ON inventory_movements(operation_id);
      CREATE INDEX IF NOT EXISTS idx_im_created ON inventory_movements(created_at);

      -- ── Operations (saídas) ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS operations (
        id              SERIAL PRIMARY KEY,
        date            DATE NOT NULL DEFAULT CURRENT_DATE,
        scheduled_time  TIME,
        start_time      TIMESTAMPTZ,
        end_time        TIMESTAMPTZ,
        spot            TEXT DEFAULT '',
        operation_type  TEXT NOT NULL DEFAULT 'outra' CHECK (operation_type IN (
          'craft', 'dominio', 'ataque', 'defesa', 'recolha', 'outra'
        )),
        status          TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN (
          'aberta', 'em_preparacao', 'em_curso', 'concluida', 'cancelada'
        )),
        leader_id       INTEGER REFERENCES members(id),
        group_number    INTEGER DEFAULT 1,
        max_participants INTEGER DEFAULT 12,
        notes           TEXT DEFAULT '',
        -- Result fields
        had_fight       BOOLEAN DEFAULT FALSE,
        enemy_name      TEXT DEFAULT '',
        enemy_count     INTEGER DEFAULT 0,
        survivors       INTEGER DEFAULT 0,
        deaths          INTEGER DEFAULT 0,
        returned_count  INTEGER DEFAULT 0,
        result_notes    TEXT DEFAULT '',
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ops_date ON operations(date);
      CREATE INDEX IF NOT EXISTS idx_ops_status ON operations(status);

      -- ── Operation participants ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS operation_participants (
        id              SERIAL PRIMARY KEY,
        operation_id    INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
        member_id       INTEGER NOT NULL REFERENCES members(id),
        role_in_op      TEXT DEFAULT 'membro',
        brought_own_material BOOLEAN DEFAULT FALSE,
        received_org_material BOOLEAN DEFAULT FALSE,
        died            BOOLEAN DEFAULT FALSE,
        survived        BOOLEAN DEFAULT TRUE,
        returned        BOOLEAN DEFAULT TRUE,
        returned_material BOOLEAN DEFAULT FALSE,
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(operation_id, member_id)
      );
      CREATE INDEX IF NOT EXISTS idx_op_part_op ON operation_participants(operation_id);
      CREATE INDEX IF NOT EXISTS idx_op_part_member ON operation_participants(member_id);

      -- ── Operation materials ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS operation_materials (
        id              SERIAL PRIMARY KEY,
        operation_id    INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
        item_id         INTEGER NOT NULL REFERENCES items(id),
        direction       TEXT NOT NULL CHECK (direction IN ('fornecido', 'devolvido', 'perdido', 'consumido')),
        quantity        INTEGER NOT NULL,
        member_id       INTEGER REFERENCES members(id),
        notes           TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_om_op ON operation_materials(operation_id);
      CREATE INDEX IF NOT EXISTS idx_om_item ON operation_materials(item_id);

      -- ── Weekly rankings ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS weekly_rankings (
        id              SERIAL PRIMARY KEY,
        member_id       INTEGER NOT NULL REFERENCES members(id),
        week_start      DATE NOT NULL,
        week_end        DATE NOT NULL,
        deliveries      INTEGER NOT NULL DEFAULT 0,
        sales           INTEGER NOT NULL DEFAULT 0,
        operations_count INTEGER NOT NULL DEFAULT 0,
        weighted_value  NUMERIC(12,2) NOT NULL DEFAULT 0,
        return_rate     NUMERIC(5,2) DEFAULT 0,
        rank_position   INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(member_id, week_start)
      );
      CREATE INDEX IF NOT EXISTS idx_wr_week ON weekly_rankings(week_start);
      CREATE INDEX IF NOT EXISTS idx_wr_member ON weekly_rankings(member_id);

      -- ── Audit logs ──────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              SERIAL PRIMARY KEY,
        action          TEXT NOT NULL,
        entity_type     TEXT NOT NULL,
        entity_id       TEXT,
        actor_id        TEXT NOT NULL,
        actor_name      TEXT DEFAULT '',
        before_state    JSONB,
        after_state     JSONB,
        context         TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_al_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_al_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_al_actor ON audit_logs(actor_id);
      CREATE INDEX IF NOT EXISTS idx_al_created ON audit_logs(created_at);

      -- ── Settings ────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS settings (
        key         TEXT PRIMARY KEY,
        value       JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Job runs ────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS job_runs (
        id          SERIAL PRIMARY KEY,
        job_name    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
        result      JSONB,
        error       TEXT,
        started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_jr_name ON job_runs(job_name);
      CREATE INDEX IF NOT EXISTS idx_jr_started ON job_runs(started_at);

      -- ── Idempotency operations ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS idempotency_ops (
        id              TEXT PRIMARY KEY,
        dedupe_key      TEXT NOT NULL,
        entity_type     TEXT NOT NULL DEFAULT '',
        entity_id       TEXT NOT NULL DEFAULT '',
        source          TEXT DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
        data            JSONB DEFAULT '{}',
        error           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at    TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_idemp_dedupe ON idempotency_ops(dedupe_key) WHERE status IN ('running', 'completed');
    `
  },
  {
    id: 2,
    name: 'add_member_tier',
    up: `
      ALTER TABLE members ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'young_blood';
      CREATE INDEX IF NOT EXISTS idx_members_tier ON members(tier);
    `
  },
  {
    id: 4,
    name: 'inventory_saldo_inicial_and_cemetery',
    up: `
      -- ── Allow saldo_inicial movement type ──────────────────────────────────
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_morador', 'venda_morador', 'entrega_oficial',
          'fornecimento_org', 'consumo_operacao', 'devolucao_operacao',
          'ajuste_manual', 'perda_operacao', 'apreendido', 'craftado'
        ));

      -- ── Track bootstrap state (one-shot per seed source) ───────────────────
      CREATE TABLE IF NOT EXISTS inventory_bootstrap (
        id          SERIAL PRIMARY KEY,
        source      TEXT NOT NULL,
        applied_by  TEXT NOT NULL,
        items_count INTEGER NOT NULL DEFAULT 0,
        total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        notes       TEXT DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Cemetery (kills registadas) ────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS cemetery_kills (
        id              SERIAL PRIMARY KEY,
        killer_id       INTEGER NOT NULL REFERENCES members(id),
        victim_name     TEXT NOT NULL,
        victim_discord_id TEXT,
        context         TEXT DEFAULT '',
        operation_id    INTEGER REFERENCES operations(id),
        date            DATE NOT NULL DEFAULT CURRENT_DATE,
        notes           TEXT DEFAULT '',
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_kills_killer ON cemetery_kills(killer_id);
      CREATE INDEX IF NOT EXISTS idx_kills_date ON cemetery_kills(date);
      CREATE INDEX IF NOT EXISTS idx_kills_operation ON cemetery_kills(operation_id);
    `
  },
  {
    id: 3,
    name: 'tag_requests_and_orders',
    up: `
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
    `
  },
  {
    id: 5,
    name: 'bot_instances',
    up: `
      CREATE TABLE IF NOT EXISTS bot_instances (
        instance_id     UUID PRIMARY KEY,
        version         TEXT NOT NULL DEFAULT '',
        git_sha         TEXT NOT NULL DEFAULT '',
        pid             INTEGER,
        hostname        TEXT NOT NULL DEFAULT '',
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        shutdown_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_bot_instances_started_at ON bot_instances(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bot_instances_heartbeat ON bot_instances(last_heartbeat DESC);
    `
  },
  {
    id: 6,
    name: 'tier_default_o_gunao',
    // A hierarquia foi corrigida: O Gunão é o tier de entrada, não Young Blood.
    // Só altera o DEFAULT da coluna — dados existentes ficam intactos e são
    // migrados controladamente via /rg-fix-tiers.
    up: `
      ALTER TABLE members ALTER COLUMN tier SET DEFAULT 'o_gunao';
    `
  }
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    const appliedIds = new Set(applied.rows.map(r => r.id));

    // Apply migrations in ascending id order (tolerate out-of-order in array)
    const ordered = [...MIGRATIONS].sort((a, b) => a.id - b.id);
    for (const migration of ordered) {
      if (appliedIds.has(migration.id)) continue;
      console.log(`[DB:Migrate] Applying migration ${migration.id}: ${migration.name}...`);
      await client.query('BEGIN');
      try {
        await client.query(migration.up);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [migration.id, migration.name]);
        await client.query('COMMIT');
        console.log(`[DB:Migrate] Migration ${migration.id} applied.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('[DB:Migrate] All migrations up to date.');
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
