'use strict';
/**
 * Integration — ciclo de vida de membro:
 *   - create → role bairrista default
 *   - promote grava member_role_history
 *   - update status → inativo
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { haveDb, cleanState } = require('./_helpers');

if (!haveDb()) {
  describe('integration/memberLifecycle', { skip: 'DATABASE_URL em falta' }, () => {});
  return;
}

const { query } = require('../../src/db');
const memberRepo = require('../../src/repositories/member');

describe('integration/memberLifecycle', () => {
  before(async () => {
    await cleanState(query);
  });

  beforeEach(async () => {
    await query("DELETE FROM member_role_history WHERE changed_by = 'admin-test'");
    await query("DELETE FROM members WHERE discord_id LIKE 'lifecycle-%'");
  });

  after(async () => {
    await query("DELETE FROM members WHERE discord_id LIKE 'lifecycle-%'");
  });

  it('memberRepo.create cria novo com defaults', async () => {
    const m = await memberRepo.create({ discordId: 'lifecycle-001', username: 'user1', displayName: 'User One' });
    assert.ok(m.id);
    assert.equal(m.discord_id, 'lifecycle-001');
    assert.equal(m.role, 'bairrista');
    assert.equal(m.status, 'ativo');
  });

  it('memberRepo.findByDiscordId é idempotente', async () => {
    const m1 = await memberRepo.create({ discordId: 'lifecycle-002', username: 'user2', displayName: 'User Two' });
    const m2 = await memberRepo.findByDiscordId('lifecycle-002');
    assert.equal(m1.id, m2.id);
  });

  it('memberRepo.promove e grava member_role_history', async () => {
    const m = await memberRepo.create({ discordId: 'lifecycle-003', username: 'u3', displayName: 'User Three' });
    const updated = await memberRepo.promote(m.id, 'oficial', 'admin-test', 'merecimento');
    assert.equal(updated.role, 'oficial');

    const history = await query(
      `SELECT old_role, new_role, changed_by, reason FROM member_role_history
        WHERE member_id = $1 ORDER BY id DESC LIMIT 1`,
      [m.id]
    );
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0].old_role, 'bairrista');
    assert.equal(history.rows[0].new_role, 'oficial');
    assert.equal(history.rows[0].changed_by, 'admin-test');
  });

  it('memberRepo.update marca status inativo', async () => {
    const m = await memberRepo.create({ discordId: 'lifecycle-004', username: 'u4', displayName: 'User Four' });
    const updated = await memberRepo.update(m.id, { status: 'inativo' });
    assert.equal(updated.status, 'inativo');

    const dbState = await query('SELECT status FROM members WHERE id = $1', [m.id]);
    assert.equal(dbState.rows[0].status, 'inativo');
  });

  it('CHECK constraint bloqueia role inválido', async () => {
    const m = await memberRepo.create({ discordId: 'lifecycle-005', username: 'u5', displayName: 'User Five' });
    let error = null;
    try {
      await memberRepo.update(m.id, { role: 'role_inexistente' });
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'devia falhar por causa do CHECK');
    assert.match(error.message, /members_role_check/i);
  });
});
