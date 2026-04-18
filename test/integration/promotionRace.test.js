'use strict';
/**
 * Integration test para I-1: advisory lock em promoção.
 *
 * Setup: inserir membro + material suficiente para promoção.
 * Act: chamar checkAndPromote N vezes em paralelo via Promise.all.
 * Assert: exactamente 1 invocação retorna { promoted: true }; todas as
 *         outras retornam null. DB tem tier final correcto + 1 audit
 *         log de auto_promotion.
 *
 * Skip se DATABASE_URL não está set (mesma convenção dos outros
 * integration tests).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { haveDb, cleanState } = require('./_helpers');

if (!haveDb()) {
  describe('integration/promotionRace', { skip: 'DATABASE_URL em falta' }, () => {});
  return;
}

const { pool, query } = require('../../src/db');

// Stub do guild / client — checkAndPromote tenta fetch members e enviar
// mensagens; como aqui estamos num ambiente CI sem Discord real,
// fornecemos fakes que NUNCA atiram.
function makeFakeGuild() {
  return {
    members: {
      fetch: async () => ({
        id: 'race-test-user',
        roles: {
          cache: {
            has: () => false,
          },
          add: async () => {},
          remove: async () => {},
        },
      }),
    },
    channels: {
      fetch: async () => null,
    },
  };
}

function makeFakeClient() {
  // sendAuditToChannel usa client.channels — devolver null faz com que a
  // função salte silenciosamente.
  return {
    channels: {
      fetch: async () => null,
    },
  };
}

describe('integration/promotionRace', () => {
  let _memberId;

  before(async () => {
    await cleanState(query);
    // Cria membro bairrista young_blood.
    await query(
      `INSERT INTO members (discord_id, username, display_name, role, tier)
       VALUES ('race-test-user', 'race', 'Race Test', 'bairrista', 'young_blood')`
    );
    const m = await query("SELECT id FROM members WHERE discord_id = 'race-test-user'");
    _memberId = m.rows[0].id;
    // Cria item + material que ultrapassa o threshold de 25000.
    await query(
      `INSERT INTO items (name, category, unit, estimated_value, active)
       VALUES ('race-test-item', 'outros', 'unidade', 10, true)
       ON CONFLICT DO NOTHING`
    );
    const i = await query("SELECT id FROM items WHERE name = 'race-test-item'");
    const itemId = i.rows[0].id;
    await query(
      `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
       VALUES ('entrega_bairrista', $1, 26000, $2, 'test')`,
      [itemId, _memberId]
    );
  });

  after(async () => {
    await query('DELETE FROM inventory_movements WHERE member_id = $1', [_memberId]);
    await query("DELETE FROM members WHERE discord_id = 'race-test-user'");
    await query("DELETE FROM items WHERE name = 'race-test-item'");
    // Não fechamos pool aqui — outro teste (inventoryLedger) faz isso.
  });

  it('N invocações concorrentes → só 1 promove, outras retornam null', async () => {
    const { checkAndPromote } = require('../../src/members/autoPromotionEngine');

    const guild = makeFakeGuild();
    const client = makeFakeClient();

    // 5 invocações concorrentes para o mesmo user.
    const results = await Promise.all([
      checkAndPromote('race-test-user', guild, client),
      checkAndPromote('race-test-user', guild, client),
      checkAndPromote('race-test-user', guild, client),
      checkAndPromote('race-test-user', guild, client),
      checkAndPromote('race-test-user', guild, client),
    ]);

    const promoted = results.filter(r => r && r.promoted);
    const nullish = results.filter(r => !r);
    assert.equal(
      promoted.length,
      1,
      `exactamente 1 invocação devia promover, actual: ${promoted.length}. Results: ${JSON.stringify(results)}`
    );
    assert.equal(nullish.length, 4);

    // Estado final da DB: tier actualizado para o_gunao.
    const r = await query('SELECT tier FROM members WHERE discord_id = $1', ['race-test-user']);
    assert.equal(r.rows[0].tier, 'o_gunao');

    // Audit log: exactamente 1 entrada de auto_promotion.
    const audit = await query(
      "SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'auto_promotion' AND entity_id = 'race-test-user'"
    );
    assert.equal(audit.rows[0].n, 1, 'deve haver exactamente 1 audit de auto_promotion');
  });

  it('invocações concorrentes para users DIFERENTES não se bloqueiam', async () => {
    // Setup: criar 2 users distintos com material suficiente.
    const otherIds = ['race-test-other-a', 'race-test-other-b'];
    for (const id of otherIds) {
      await query(
        `INSERT INTO members (discord_id, username, display_name, role, tier)
         VALUES ($1, $1, $1, 'bairrista', 'young_blood')
         ON CONFLICT (discord_id) DO UPDATE SET tier = 'young_blood'`,
        [id]
      );
    }
    const i = await query("SELECT id FROM items WHERE name = 'race-test-item'");
    const itemId = i.rows[0].id;
    for (const id of otherIds) {
      const m = await query('SELECT id FROM members WHERE discord_id = $1', [id]);
      await query(
        `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
         VALUES ('entrega_bairrista', $1, 26000, $2, 'test')`,
        [itemId, m.rows[0].id]
      );
    }

    const { checkAndPromote } = require('../../src/members/autoPromotionEngine');
    const guild = makeFakeGuild();
    const client = makeFakeClient();

    const start = Date.now();
    const results = await Promise.all([
      checkAndPromote('race-test-other-a', guild, client),
      checkAndPromote('race-test-other-b', guild, client),
    ]);
    const elapsed = Date.now() - start;

    assert.equal(results.filter(r => r && r.promoted).length, 2, 'ambos users diferentes devem promover');
    assert.ok(elapsed < 5000, `tempo ${elapsed}ms — locks per-user não devem bloquear entre users distintos`);

    // Cleanup
    for (const id of otherIds) {
      const m = await query('SELECT id FROM members WHERE discord_id = $1', [id]);
      if (m.rows[0]) {
        await query('DELETE FROM inventory_movements WHERE member_id = $1', [m.rows[0].id]);
      }
    }
    await query('DELETE FROM audit_logs WHERE entity_id = ANY($1)', [otherIds]);
    await query('DELETE FROM members WHERE discord_id = ANY($1)', [otherIds]);
  });
});
