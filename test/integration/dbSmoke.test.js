'use strict';
/**
 * Smoke test — verifica que DB está acessível, migrations foram aplicadas,
 * e que as CHECK constraints bloqueiam valores legacy (migration 027).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { haveDb } = require('./_helpers');

if (!haveDb()) {
  describe('integration/dbSmoke', { skip: 'DATABASE_URL em falta' }, () => {});
  return;
}

const { pool } = require('../../src/db');

describe('integration/dbSmoke', () => {
  after(async () => {
    await pool.end();
  });

  before(async () => {
    // Sanity: pool existe.
    assert.ok(pool, 'pool não inicializado — DATABASE_URL válido?');
  });

  it('conecta à DB', async () => {
    const r = await pool.query('SELECT 1 AS ok');
    assert.equal(r.rows[0].ok, 1);
  });

  it('schema_migrations tem 27 migrations aplicadas', async () => {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
    assert.ok(r.rows[0].n >= 27, `esperam-se >= 27 migrations, actual: ${r.rows[0].n}`);
  });

  it('members.role CHECK constraint rejeita valores inválidos', async () => {
    // Migration 071 re-adicionou morador/chefe_moradores ao CHECK por
    // compatibilidade legada — testamos um valor que NUNCA foi válido.
    let error = null;
    try {
      await pool.query('INSERT INTO members (discord_id, username, display_name, role) VALUES ($1, $2, $3, $4)', [
        'legacy-test-1',
        'legacy',
        'Legacy Test',
        'role_inexistente',
      ]);
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'CHECK devia ter rejeitado role=role_inexistente');
    assert.match(error.message, /members_role_check/i);
  });

  it('members.role CHECK aceita valores novos', async () => {
    await pool.query('INSERT INTO members (discord_id, username, display_name, role) VALUES ($1, $2, $3, $4)', [
      'ok-test-1',
      'ok',
      'OK Test',
      'bairrista',
    ]);
    await pool.query("DELETE FROM members WHERE discord_id = 'ok-test-1'");
  });

  it('inventory_movements CHECK rejeita movement_types legacy', async () => {
    // Precisa de item + member válidos para passar FKs; criamos minimal.
    await pool.query(
      "INSERT INTO members (discord_id, username, display_name, role) VALUES ('mv-test', 'x', 'x', 'bairrista') ON CONFLICT DO NOTHING"
    );
    const m = await pool.query("SELECT id FROM members WHERE discord_id = 'mv-test'");
    const memberId = m.rows[0].id;
    await pool.query(
      "INSERT INTO items (name, category, unit, estimated_value) VALUES ('mv-test-item', 'outros', 'unidade', 10) ON CONFLICT DO NOTHING"
    );
    const i = await pool.query("SELECT id FROM items WHERE name = 'mv-test-item'");
    const itemId = i.rows[0].id;

    let error = null;
    try {
      await pool.query(
        `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        ['entrega_morador', itemId, 5, memberId, 'test']
      );
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'CHECK devia ter rejeitado entrega_morador');
    assert.match(error.message, /inventory_movements_movement_type_check/i);

    // Cleanup
    await pool.query("DELETE FROM members WHERE discord_id = 'mv-test'");
    await pool.query("DELETE FROM items WHERE name = 'mv-test-item'");
  });

  // ── Migration 028: tag_requests extensions ─────────────────────────────
  it('migration 028: tag_requests tem denial_reason, retry_count, channel_create_failed, processed_at', async () => {
    const r = await pool.query(`
      SELECT column_name, is_nullable, data_type
        FROM information_schema.columns
       WHERE table_name = 'tag_requests'
         AND column_name IN ('denial_reason', 'retry_count', 'channel_create_failed', 'processed_at')
       ORDER BY column_name`);
    const cols = r.rows.map(row => row.column_name);
    assert.deepEqual(cols.sort(), ['channel_create_failed', 'denial_reason', 'processed_at', 'retry_count']);
  });

  it('migration 028: índice ix_tag_requests_discord_id_status existe', async () => {
    const r = await pool.query(`
      SELECT indexname FROM pg_indexes
       WHERE tablename = 'tag_requests'
         AND indexname = 'ix_tag_requests_discord_id_status'`);
    assert.equal(r.rows.length, 1, 'índice deve existir');
  });

  // ── Migration 029: spot_cooldowns ──────────────────────────────────────
  it('migration 029: tabela spot_cooldowns existe com schema correcto', async () => {
    const r = await pool.query(`
      SELECT column_name, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'spot_cooldowns'
       ORDER BY ordinal_position`);
    const cols = r.rows.map(row => row.column_name);
    assert.ok(cols.includes('spot'));
    assert.ok(cols.includes('started_at'));
    assert.ok(cols.includes('expires_at'));
    assert.ok(cols.includes('saida_id'));
    assert.ok(cols.includes('notification_channel_id'));
    assert.ok(cols.includes('notification_msg_id'));
  });

  it('migration 029: PRIMARY KEY em spot previne duplicados (UPSERT)', async () => {
    const future = new Date(Date.now() + 60_000);
    await pool.query("INSERT INTO spot_cooldowns (spot, expires_at, saida_id) VALUES ('smoke-test-spot', $1, 1)", [
      future,
    ]);
    // Segunda insert com mesmo spot — deve falhar (PK) ou ser suportada por ON CONFLICT.
    let error = null;
    try {
      await pool.query("INSERT INTO spot_cooldowns (spot, expires_at, saida_id) VALUES ('smoke-test-spot', $1, 2)", [
        future,
      ]);
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'PK em spot devia rejeitar duplicado sem ON CONFLICT');
    assert.match(error.message, /duplicate key|unique/i);

    // ON CONFLICT funciona (o engine faz isto):
    await pool.query(
      `INSERT INTO spot_cooldowns (spot, expires_at, saida_id) VALUES ('smoke-test-spot', $1, 99)
       ON CONFLICT (spot) DO UPDATE SET saida_id = EXCLUDED.saida_id`,
      [future]
    );
    const r = await pool.query("SELECT saida_id FROM spot_cooldowns WHERE spot = 'smoke-test-spot'");
    assert.equal(r.rows[0].saida_id, 99);

    // Cleanup
    await pool.query("DELETE FROM spot_cooldowns WHERE spot = 'smoke-test-spot'");
  });
});
