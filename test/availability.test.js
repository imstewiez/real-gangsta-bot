'use strict';
/**
 * Testes do sistema de disponibilidade — exercitam embed/components/templates
 * sem tocar na DB nem no Discord. Garantem que a UI gerada respeita os
 * limites do Discord (5 rows, 25 options por select, 5 buttons por row).
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// Stub db + repositories antes de carregar o engine.
require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};
require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: {},
    inventoryRepo: {},
    operationRepo: {},
    rankingRepo: {},
    auditRepo: {},
    jobRepo: {},
    availabilityRepo: { getSlots: async () => [], getTallies: async () => [], getDistinctVoterCount: async () => 0 },
  },
};
require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {}, sendAuditToChannel: async () => {} },
};

const {
  HEADERS,
  STATE_META,
  STATE_ORDER,
  pickHeader,
  stateMeta,
} = require('../src/availability/availabilityTemplates');
const { buildEmbed, buildComponents, todayDateString } = require('../src/availability/availabilityEngine');

describe('availabilityTemplates', () => {
  it('tem ≥ 5 cabeçalhos rotativos', () => {
    assert.ok(HEADERS.length >= 5, `esperam-se ≥5 cabeçalhos, há ${HEADERS.length}`);
  });

  it('STATE_META tem disponivel/indisponivel/talvez', () => {
    for (const s of ['disponivel', 'indisponivel', 'talvez']) {
      assert.ok(STATE_META[s], `STATE_META.${s} em falta`);
      assert.ok(STATE_META[s].emoji);
      assert.ok(STATE_META[s].label);
    }
  });

  it('STATE_ORDER cobre os 3 estados', () => {
    assert.equal(STATE_ORDER.length, 3);
    assert.deepEqual([...STATE_ORDER].sort(), ['disponivel', 'indisponivel', 'talvez']);
  });

  it('pickHeader devolve sempre uma string do array', () => {
    for (let i = 0; i < 30; i++) assert.ok(HEADERS.includes(pickHeader()));
  });

  it('stateMeta com estado desconhecido devolve fallback', () => {
    const m = stateMeta('xxx');
    assert.equal(m.emoji, 'ℹ️');
    assert.equal(m.label, 'xxx');
  });
});

describe('availabilityEngine — UI builders', () => {
  const fakeSession = {
    id: 1,
    session_date: '2026-04-13',
    header_text: 'Quem alinha hoje?',
    status: 'open',
    mention_role_ids: '',
  };

  it('todayDateString tem formato YYYY-MM-DD', () => {
    assert.match(todayDateString(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('buildEmbed tem título, fields por slot e total de votantes no description', () => {
    const tallies = [
      { slotId: 1, label: '20:30', position: 0, counts: { disponivel: 3, indisponivel: 1 } },
      { slotId: 2, label: '21:30', position: 1, counts: { talvez: 2 } },
    ];
    const embed = buildEmbed(fakeSession, tallies, 4);
    const json = embed.toJSON();
    assert.ok(json.title.includes('Presença'));
    assert.equal(json.fields.length, 2);
    assert.ok(json.fields[0].name.includes('20:30'));
    // Embed redesign: total de votantes aparece no description (com emoji 👥)
    // e o footer tem metadata da sessão.
    assert.ok(json.description.includes('4'));
    assert.ok(json.description.includes('votaram'));
    assert.ok(json.footer.text.includes(`sessão #${fakeSession.id}`));
  });

  it('buildComponents respeita os limites do Discord (≤5 rows, ≤25 options no select)', () => {
    const slots = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, slot_label: `${20 + i}:30` }));
    const rows = buildComponents(fakeSession, slots);
    assert.ok(rows.length <= 5, `≤5 rows; foram ${rows.length}`);

    const selectRow = rows[0].toJSON();
    const select = selectRow.components[0];
    // Tipo 3 = StringSelectMenu
    assert.equal(select.type, 3);
    // 8 slots × 3 estados = 24 opções (≤25)
    assert.equal(select.options.length, 24);

    // Restantes rows são botões — máx 5 por row
    for (let i = 1; i < rows.length; i++) {
      const btnRow = rows[i].toJSON();
      assert.ok(btnRow.components.length <= 5);
    }
  });

  it('buildComponents devolve [] em sessão fechada', () => {
    const closed = { ...fakeSession, status: 'closed' };
    const rows = buildComponents(closed, []);
    assert.deepEqual(rows, []);
  });
});
