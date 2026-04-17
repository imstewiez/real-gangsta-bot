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
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(f => {
    const match = f.match(/^(\d+)_(.+)\.sql$/);
    if (!match) return null;
    return {
      id: parseInt(match[1], 10),
      name: match[2],
      file: f,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'),
    };
  }).filter(Boolean);
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
  } finally {
    client.release();
  }
}

module.exports = { runMigrations, loadMigrations };
