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

  it('buildEmbed tem título, slots em fields e total de votantes', () => {
    const tallies = [
      { slotId: 1, label: '12:00', position: 0, counts: { disponivel: 3, indisponivel: 1 } },
      { slotId: 2, label: '14:00', position: 1, counts: { talvez: 2 } },
      { slotId: 3, label: '20:00', position: 2, counts: { disponivel: 8, talvez: 1 } },
    ];
    const embed = buildEmbed(fakeSession, tallies, 4);
    const json = embed.toJSON();
    assert.ok(json.title.includes('Presença'));
    // Slots aparecem em fields (um por período)
    const fieldValues = json.fields.map(f => f.value).join('\n');
    assert.ok(fieldValues.includes('12:00'));
    assert.ok(fieldValues.includes('14:00'));
    assert.ok(fieldValues.includes('20:00'));
    assert.ok(json.description.includes('4'));
    assert.ok(json.description.includes('votaram'));
    assert.ok(json.footer.text.includes(`sessão #${fakeSession.id}`));
    // Pico destacado
    assert.ok(json.description.includes('Pico:'));
    assert.ok(fieldValues.includes('🔥'));
  });

  it('buildEmbed fecha com fields (slots por período)', () => {
    const tallies = [{ slotId: 1, label: '12:00', position: 0, counts: {} }];
    const embed = buildEmbed({ ...fakeSession, status: 'closed' }, tallies, 0);
    const json = embed.toJSON();
    assert.ok(json.description.includes('fechada'));
    const fieldValues = json.fields.map(f => f.value).join('\n');
    assert.ok(fieldValues.includes('12:00'));
    assert.ok(json.fields.length > 0);
  });

  it('buildComponents respeita os limites do Discord (≤5 rows, ≤25 options no select)', () => {
    const slots = [
      { id: 1, slot_label: '12:00' },
      { id: 2, slot_label: '14:00' },
      { id: 3, slot_label: '16:00' },
      { id: 4, slot_label: '18:00' },
      { id: 5, slot_label: '20:00' },
      { id: 6, slot_label: '22:00' },
      { id: 7, slot_label: '00:00' },
      { id: 8, slot_label: '02:00' },
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

describe('availabilityTemplates — ranges', () => {
  const slots = [
    { id: 1, slot_label: '12:00' },
    { id: 2, slot_label: '14:00' },
    { id: 3, slot_label: '16:00' },
    { id: 4, slot_label: '18:00' },
    { id: 5, slot_label: '20:00' },
    { id: 6, slot_label: '22:00' },
    { id: 7, slot_label: '00:00' },
    { id: 8, slot_label: '02:00' },
  ];

  it('buildSelectOptions gera opções dentro do limite de 25', () => {
    const opts = buildSelectOptions(slots);
    assert.ok(opts.length <= 25, `≤25 opções; foram ${opts.length}`);
    assert.ok(opts.length >= 3, 'deve haver pelo menos 3 opções');
    // Deve conter opções de intervalo + limpar
    assert.ok(opts.some(o => o.value === 'dia_todo:disponivel'));
    assert.ok(opts.some(o => o.value === 'tarde:disponivel'));
    assert.ok(opts.some(o => o.value === 'limpar:limpar'));
  });

  it('resolveRangeValue resolve intervalos para slot_ids correctos', () => {
    const r1 = resolveRangeValue('tarde:disponivel', slots);
    assert.equal(r1.state, 'disponivel');
    assert.deepEqual(r1.slotIds, [1, 2, 3, 4]);

    const r2 = resolveRangeValue('noite:disponivel', slots);
    assert.deepEqual(r2.slotIds, [4, 5, 6]);

    const r3 = resolveRangeValue('madrugada:disponivel', slots);
    assert.deepEqual(r3.slotIds, [6, 7, 8]);

    const r4 = resolveRangeValue('dia_todo:talvez', slots);
    assert.equal(r4.state, 'talvez');
    assert.equal(r4.slotIds.length, 8);

    const r5 = resolveRangeValue('limpar:limpar', slots);
    assert.equal(r5.state, 'limpar');
    assert.equal(r5.slotIds.length, 8);
  });

  it('resolveRangeValue resolve slot individual', () => {
    const r = resolveRangeValue('14:00:disponivel', slots);
    assert.equal(r.state, 'disponivel');
    assert.deepEqual(r.slotIds, [2]);
  });

  it('resolveRangeValue devolve null para value inválido', () => {
    assert.equal(resolveRangeValue('invalid', slots), null);
    assert.equal(resolveRangeValue('', slots), null);
  });
});
