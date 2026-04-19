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

    const migrations = loadMigrations();
    let count = 0;
    for (const migration of migrations) {
      if (appliedIds.has(migration.id)) continue;
      console.log(`[DB:Migrate] Applying migration ${migration.id}: ${migration.name} (${migration.file})...`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [migration.id, migration.name]);
        await client.query('COMMIT');
        console.log(`[DB:Migrate] Migration ${migration.id} applied.`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB:Migrate] Migration ${migration.id} FAILED: ${err.message}`);
        throw err;
      }
    }

    if (count > 0) {
      console.log(`[DB:Migrate] ${count} migration(s) applied.`);
    } else {
      console.log('[DB:Migrate] All migrations up to date.');
    }

    // Safety net — re-executa DDL idempotente de tabelas/colunas críticas em
    // cada boot, bypassing schema_migrations. Observado em Railway prod:
    // schema_migrations regista IDs como aplicados mas as tabelas desaparecem
    // (hipótese: volume reset, restore de backup, drop manual). Sem este
    // fallback, o bot arranca "all migrations up to date" mas job crasha ao
    // usar spot_cooldowns ou recordSheetSync falha por column missing.
    await ensureCriticalSchema(client);
  } finally {
    client.release();
  }
}

async function ensureCriticalSchema(client) {
  const ddls = [
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
  ];
  let applied = 0;
  for (const { name, sql } of ddls) {
    try {
      await client.query(sql);
      applied += 1;
    } catch (e) {
      console.warn(`[DB:Migrate] ensureCriticalSchema '${name}' falhou (non-fatal): ${e.message}`);
    }
  }
  console.log(`[DB:Migrate] ensureCriticalSchema: ${applied}/${ddls.length} DDLs idempotentes OK.`);
}

module.exports = { runMigrations, loadMigrations, ensureCriticalSchema };
