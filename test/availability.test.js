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
  buildSelectOptions,
  resolveRangeValue,
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

  it('buildEmbed tem título, slots na description e total de votantes', () => {
    const tallies = [
      { slotId: 1, label: 'Dia Todo', position: 0, counts: { disponivel: 3, indisponivel: 1 } },
      { slotId: 2, label: 'Tarde', position: 1, counts: { talvez: 2 } },
      { slotId: 3, label: 'Noite', position: 2, counts: { disponivel: 8, talvez: 1 } },
    ];
    const embed = buildEmbed(fakeSession, tallies, 4);
    const json = embed.toJSON();
    assert.ok(json.title.includes('Presença'));
    // Slots aparecem na description (não em fields)
    assert.ok(json.description.includes('Dia Todo'));
    assert.ok(json.description.includes('Tarde'));
    assert.ok(json.description.includes('Noite'));
    assert.ok(json.description.includes('4'));
    assert.ok(json.description.includes('votaram'));
    assert.ok(json.footer.text.includes(`sessão #${fakeSession.id}`));
  });

  it('buildEmbed fecha sem fields', () => {
    const tallies = [{ slotId: 1, label: 'Dia Todo', position: 0, counts: {} }];
    const embed = buildEmbed({ ...fakeSession, status: 'closed' }, tallies, 0);
    const json = embed.toJSON();
    assert.ok(json.description.includes('fechada'));
    assert.ok(json.description.includes('Dia Todo'));
    // Não deve ter fields (layout simplificado)
    assert.ok(!json.fields || json.fields.length === 0);
  });

  it('buildComponents respeita os limites do Discord (≤5 rows, ≤25 options no select)', () => {
    const slots = [
      { id: 1, slot_label: 'Dia Todo' },
      { id: 2, slot_label: 'Tarde' },
      { id: 3, slot_label: 'Noite' },
    ];
    const rows = buildComponents(fakeSession, slots);
    assert.ok(rows.length <= 5, `≤5 rows; foram ${rows.length}`);

    const selectRow = rows[0].toJSON();
    const select = selectRow.components[0];
    // Tipo 3 = StringSelectMenu
    assert.equal(select.type, 3);
    assert.ok(select.options.length <= 25, `≤25 opções; foram ${select.options.length}`);
    assert.ok(select.options.length > 0, 'select deve ter opções');

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

describe('availabilityTemplates — slots', () => {
  const slots = [
    { id: 1, slot_label: 'Dia Todo' },
    { id: 2, slot_label: 'Tarde' },
    { id: 3, slot_label: 'Noite' },
  ];

  it('buildSelectOptions gera opções dentro do limite de 25', () => {
    const opts = buildSelectOptions(slots);
    assert.ok(opts.length <= 25, `≤25 opções; foram ${opts.length}`);
    // 3 slots + 1 limpar = 4 (simplificado: apenas disponível no dropdown)
    assert.equal(opts.length, 4, '3 slots + limpar = 4');
    assert.ok(opts.some(o => o.value === 'Dia Todo:disponivel'));
    assert.ok(opts.some(o => o.value === 'Tarde:disponivel'));
    assert.ok(opts.some(o => o.value === 'Noite:disponivel'));
    assert.ok(opts.some(o => o.value === 'limpar:limpar'));
  });

  it('resolveRangeValue resolve slot individual', () => {
    const r = resolveRangeValue('Dia Todo:disponivel', slots);
    assert.equal(r.state, 'disponivel');
    assert.deepEqual(r.slotIds, [1]);

    const r2 = resolveRangeValue('Tarde:talvez', slots);
    assert.equal(r2.state, 'talvez');
    assert.deepEqual(r2.slotIds, [2]);

    const r3 = resolveRangeValue('Noite:indisponivel', slots);
    assert.equal(r3.state, 'indisponivel');
    assert.deepEqual(r3.slotIds, [3]);
  });

  it('resolveRangeValue resolve limpar', () => {
    const r = resolveRangeValue('limpar:limpar', slots);
    assert.equal(r.state, 'limpar');
    assert.equal(r.slotIds.length, 3);
  });

  it('resolveRangeValue devolve null para value inválido', () => {
    assert.equal(resolveRangeValue('invalid', slots), null);
    assert.equal(resolveRangeValue('', slots), null);
    assert.equal(resolveRangeValue('Slot Inexistente:disponivel', slots), null);
  });
});
