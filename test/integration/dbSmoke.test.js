'use strict';
/**
 * Smoke test — verifica que DB está acessível, migrations foram aplicadas,
 * e que as CHECK constraints bloqueiam valores legacy (migration 027).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { haveDb } = require('./_helpers');

if (!haveDb()) {
  describe('integration/dbSmoke', { skip: 'DATABASE_URL em falta' }, () => {});
  return;
}

const { pool } = require('../../src/db');

describe('integration/dbSmoke', () => {
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

  it('members.role CHECK constraint rejeita valores legacy', async () => {
    // Insert directo — tem de falhar por causa do CHECK recriado na 027.
    let error = null;
    try {
      await pool.query(`INSERT INTO members (discord_id, username, display_name, role) VALUES ($1, $2, $3, $4)`, [
        'legacy-test-1',
        'legacy',
        'Legacy Test',
        'morador',
      ]);
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'CHECK devia ter rejeitado role=morador');
    assert.match(error.message, /members_role_check/i);
  });

  it('members.role CHECK aceita valores novos', async () => {
    await pool.query(`INSERT INTO members (discord_id, username, display_name, role) VALUES ($1, $2, $3, $4)`, [
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
      `INSERT INTO members (discord_id, username, display_name, role) VALUES ('mv-test', 'x', 'x', 'bairrista') ON CONFLICT DO NOTHING`
    );
    const m = await pool.query("SELECT id FROM members WHERE discord_id = 'mv-test'");
    const memberId = m.rows[0].id;
    await pool.query(
      `INSERT INTO items (name, category, unit, estimated_value) VALUES ('mv-test-item', 'outros', 'unidade', 10) ON CONFLICT DO NOTHING`
    );
    const i = await pool.query("SELECT id FROM items WHERE name = 'mv-test-item'");
    const itemId = i.rows[0].id;

    let error = null;
    try {
      await pool.query(
        `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id)
         VALUES ($1, $2, $3, $4)`,
        ['entrega_morador', itemId, 5, memberId]
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
});
