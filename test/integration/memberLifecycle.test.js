'use strict';
/**
 * Integration — ciclo de vida de membro:
 *   - create → promote bairrista → o_gunao via material
 *   - updateMemberRole adiciona audit entry
 *   - deactivateMember marca status inativo
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { haveDb, cleanState } = require('./_helpers');

if (!haveDb()) {
  describe('integration/memberLifecycle', { skip: 'DATABASE_URL em falta' }, () => {});
  return;
}

const { query } = require('../../src/db');
const { getOrCreateMember, updateMemberRole, deactivateMember } = require('../../src/members/memberEngine');

describe('integration/memberLifecycle', () => {
  before(async () => {
    await cleanState(query);
  });

  beforeEach(async () => {
    await query("DELETE FROM audit_logs WHERE actor_id = 'admin-test'");
    await query("DELETE FROM members WHERE discord_id LIKE 'lifecycle-%'");
  });

  after(async () => {
    await query("DELETE FROM members WHERE discord_id LIKE 'lifecycle-%'");
  });

  it('getOrCreateMember cria novo', async () => {
    const m = await getOrCreateMember('lifecycle-001', 'user1', 'User One');
    assert.ok(m.id);
    assert.equal(m.discord_id, 'lifecycle-001');
    assert.equal(m.role, 'bairrista');
    assert.equal(m.status, 'ativo');
  });

  it('getOrCreateMember é idempotente', async () => {
    const m1 = await getOrCreateMember('lifecycle-002', 'user2', 'User Two');
    const m2 = await getOrCreateMember('lifecycle-002', 'user2', 'User Two');
    assert.equal(m1.id, m2.id);
  });

  it('updateMemberRole promove e grava audit', async () => {
    const m = await getOrCreateMember('lifecycle-003', 'u3', 'User Three');
    const updated = await updateMemberRole(m.id, 'oficial', 'admin-test', 'merecimento');
    assert.equal(updated.role, 'oficial');

    const audit = await query(
      `SELECT action, before_state, after_state FROM audit_logs
        WHERE actor_id = 'admin-test' AND action = 'member_role_changed'
        ORDER BY id DESC LIMIT 1`
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(JSON.parse(audit.rows[0].before_state).role, 'bairrista');
    assert.equal(JSON.parse(audit.rows[0].after_state).role, 'oficial');
  });

  it('deactivateMember marca status inativo', async () => {
    const m = await getOrCreateMember('lifecycle-004', 'u4', 'User Four');
    const updated = await deactivateMember(m.id, 'admin-test', 'saiu do bairro');
    assert.equal(updated.status, 'inativo');

    const dbState = await query('SELECT status FROM members WHERE id = $1', [m.id]);
    assert.equal(dbState.rows[0].status, 'inativo');
  });

  it('CHECK constraint bloqueia role legacy em promote', async () => {
    const m = await getOrCreateMember('lifecycle-005', 'u5', 'User Five');
    let error = null;
    try {
      await updateMemberRole(m.id, 'morador', 'admin-test', 'tentar legacy');
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'devia falhar por causa do CHECK');
    assert.match(error.message, /members_role_check/i);
  });
});
