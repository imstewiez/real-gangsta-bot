'use strict';
/**
 * Migration runner — lê ficheiros .sql de migrations/ e aplica em ordem.
 *
 * Cada ficheiro: NNN_nome.sql (ex: 001_initial_schema.sql)
 * O ID é o número no prefixo. Migrations já aplicadas (em schema_migrations)
 * são saltadas. Novas migrations são aplicadas em transacção individual.
 *
 * Regras:
 *   - Migrations são imutáveis — nunca editar depois de aplicada
 *   - IDs são incrementais e únicos
 *   - Cada migration corre num BEGIN/COMMIT próprio
 *   - Se falhar, faz ROLLBACK e aborta (não tenta as seguintes)
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');
const MIGRATION_LOCK_ID = 884729105;

function loadMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files
    .map(f => {
      const match = f.match(/^(\d+)_(.+)\.sql$/);
      if (!match) return null;
      return {
        id: parseInt(match[1], 10),
        name: match[2],
        file: f,
        sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'),
      };
    })
    .filter(Boolean);
}

async function checkPendingMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const applied = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    const appliedIds = new Set(applied.rows.map(r => r.id));
    const migrations = loadMigrations();
    const pending = migrations.filter(m => !appliedIds.has(m.id));
    return pending;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [MIGRATION_LOCK_ID]);
    if (!lockRes.rows[0].acquired) {
      throw new Error('[MIGRATE] Outra instância está a correr migrations. Abortando.');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT id FROM schema_migrations ORDER BY id');
    const appliedIds = new Set(applied.rows.map(r => r.id));

    const migrations = loadMigrations();
    let count = 0;
    for (const migration of migrations) {
      if (appliedIds.has(migration.id)) continue;
      require('./logger').log(
        `[DB:Migrate] Applying migration ${migration.id}: ${migration.name} (${migration.file})...`
      );
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [migration.id, migration.name]);
        await client.query('COMMIT');
        require('./logger').log(`[DB:Migrate] Migration ${migration.id} applied.`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        require('./logger').error(`[DB:Migrate] Migration ${migration.id} FAILED: ${err.message}`);
        throw err;
      }
    }

    if (count > 0) {
      require('./logger').log(`[DB:Migrate] ${count} migration(s) applied.`);
    } else {
      require('./logger').log('[DB:Migrate] All migrations up to date.');
    }

    // Safety net — re-executa DDL idempotente de tabelas/colunas críticas em
    // cada boot, bypassing schema_migrations. Mantém compatibilidade com DBs
    // antigas/restauradas sem forçar constraints rígidas sobre dados legacy.
    await ensureCriticalSchema(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    client.release();
  }
}

async function ensureCriticalSchema(client) {
  const ddls = [
    {
      name: 'members compatibility columns',
      sql: `ALTER TABLE members
              ADD COLUMN IF NOT EXISTS tier TEXT,
              ADD COLUMN IF NOT EXISTS nickname TEXT,
              ADD COLUMN IF NOT EXISTS full_name TEXT,
              ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'active',
              ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS lifecycle_changed_by TEXT,
              ADD COLUMN IF NOT EXISTS lifecycle_notes TEXT,
              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS deleted_by TEXT,
              ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1,
              ADD COLUMN IF NOT EXISTS last_discord_reconciled_at TIMESTAMPTZ`,
    },
    {
      name: 'drop legacy members.role constraint',
      sql: `ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check`,
    },
    {
      name: 'drop legacy members.status constraint',
      sql: `ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check`,
    },
    {
      name: 'members active indexes',
      sql: `CREATE INDEX IF NOT EXISTS idx_members_active_discord
              ON members (discord_id)
              WHERE deleted_at IS NULL`,
    },
    {
      name: 'spot_cooldowns table',
      sql: `CREATE TABLE IF NOT EXISTS spot_cooldowns (
              spot                     TEXT PRIMARY KEY,
              started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              expires_at               TIMESTAMPTZ NOT NULL,
              saida_id                 INTEGER,
              notification_channel_id  TEXT,
              notification_msg_id      TEXT,
              created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`,
    },
    {
      name: 'spot_cooldowns index',
      sql: 'CREATE INDEX IF NOT EXISTS ix_spot_cooldowns_expires_at ON spot_cooldowns (expires_at)',
    },
    {
      name: 'sheet_sync_state.consecutive_errors',
      sql: 'ALTER TABLE sheet_sync_state ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER NOT NULL DEFAULT 0',
    },
    {
      name: 'tag_requests recovery columns',
      sql: `ALTER TABLE tag_requests
              ADD COLUMN IF NOT EXISTS denial_reason          TEXT,
              ADD COLUMN IF NOT EXISTS retry_count            INTEGER NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS channel_create_failed  BOOLEAN NOT NULL DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS processed_at           TIMESTAMPTZ`,
    },
    {
      name: 'managed_topic_categories table',
      sql: `CREATE TABLE IF NOT EXISTS managed_topic_categories (
              id          SERIAL PRIMARY KEY,
              category_id TEXT NOT NULL UNIQUE,
              role        TEXT NOT NULL DEFAULT 'overflow-auto'
                          CHECK (role IN ('primary', 'overflow-env', 'overflow-auto')),
              created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              notes       TEXT
            )`,
    },
    {
      name: 'managed_topic_categories index',
      sql: 'CREATE INDEX IF NOT EXISTS ix_managed_topic_categories_role ON managed_topic_categories (role)',
    },
    {
      name: 'operation_participants.participant_type constraint (pending/requested)',
      sql: `DO $$ BEGIN
              ALTER TABLE operation_participants
                DROP CONSTRAINT IF EXISTS operation_participants_participant_type_check;
              ALTER TABLE operation_participants
                ADD CONSTRAINT operation_participants_participant_type_check
                CHECK (participant_type IN ('caracterizado', 'trabalhador', 'pending', 'requested'));
            EXCEPTION WHEN others THEN NULL;
            END $$`,
    },
    {
      name: 'operations.session_started_at column',
      sql: 'ALTER TABLE operations ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ',
    },
    {
      name: 'inventory_movements cart columns (migration 038)',
      sql: `ALTER TABLE inventory_movements
              ADD COLUMN IF NOT EXISTS submission_id   UUID,
              ADD COLUMN IF NOT EXISTS unit_price      NUMERIC(12,2),
              ADD COLUMN IF NOT EXISTS log_message_id  TEXT,
              ADD COLUMN IF NOT EXISTS log_channel_id  TEXT`,
    },
    {
      name: 'inventory_movements.submission_id index',
      sql: `CREATE INDEX IF NOT EXISTS idx_inventory_movements_submission_id
              ON inventory_movements (submission_id)
              WHERE submission_id IS NOT NULL`,
    },
    {
      name: 'leaderboard_messages table (migration 039)',
      sql: `CREATE TABLE IF NOT EXISTS leaderboard_messages (
              channel_id         TEXT PRIMARY KEY,
              message_id         TEXT NOT NULL,
              last_refreshed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`,
    },
    {
      name: 'inventory_delivery_requests table (migration 040)',
      sql: `CREATE TABLE IF NOT EXISTS inventory_delivery_requests (
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
              movement_submission_id UUID,
              decision_by            TEXT,
              decision_reason        TEXT NOT NULL DEFAULT '',
              decided_at             TIMESTAMPTZ,
              created_by             TEXT NOT NULL,
              created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`,
    },
    {
      name: 'inventory_delivery_requests compatibility columns',
      sql: `ALTER TABLE inventory_delivery_requests
              ADD COLUMN IF NOT EXISTS responsavel_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
              ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entrega'`,
    },
    {
      name: 'inventory_delivery_requests approver pending index',
      sql: `CREATE INDEX IF NOT EXISTS idx_inventory_delivery_requests_approver_pending
              ON inventory_delivery_requests (approver_discord_id, created_at DESC)
              WHERE status = 'pending'`,
    },
    {
      name: 'inventory_delivery_requests requester created index',
      sql: `CREATE INDEX IF NOT EXISTS idx_inventory_delivery_requests_requester_created
              ON inventory_delivery_requests (requester_discord_id, created_at DESC)`,
    },
  ];
  let applied = 0;
  for (const { name, sql } of ddls) {
    try {
      await client.query(sql);
      applied += 1;
    } catch (e) {
      require('./logger').warn(`[DB:Migrate] ensureCriticalSchema '${name}' falhou (non-fatal): ${e.message}`);
    }
  }
  require('./logger').log(`[DB:Migrate] ensureCriticalSchema: ${applied}/${ddls.length} DDLs idempotentes OK.`);
}

module.exports = { runMigrations, checkPendingMigrations, loadMigrations, ensureCriticalSchema };
