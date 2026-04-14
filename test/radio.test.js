'use strict';
/**
 * Testes do radioEngine — validações e geração aleatória, sem DB.
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

require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  },
};
require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: {}, inventoryRepo: {}, operationRepo: {}, rankingRepo: {},
    auditRepo: {}, jobRepo: {}, availabilityRepo: {},
    radioRepo: {
      getAllStates: async () => [],
      setState: async (x) => ({ ...x, previous: '' }),
      listHistory: async () => [],
    },
  },
};
require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {} },
};

const {
  isValidValue, generateRandom, buildEmbed, buildComponents, TYPE_META,
} = require('../src/radio/radioEngine');

describe('radioEngine — validação', () => {
  it('aceita valores no range default 1000-9999', () => {
    assert.equal(isValidValue('1000'), true);
    assert.equal(isValidValue('9999'), true);
    assert.equal(isValidValue('5432'), true);
  });

  it('rejeita valores fora do range', () => {
    assert.equal(isValidValue('999'), false);
    assert.equal(isValidValue('10000'), false);
    assert.equal(isValidValue('-5'), false);
  });

  it('rejeita não-numéricos', () => {
    assert.equal(isValidValue('abc'), false);
    assert.equal(isValidValue('12a'), false);
    assert.equal(isValidValue(''), false);
    assert.equal(isValidValue(null), false);
  });

  it('rejeita 0 quando RADIO_ALLOW_ZERO=false (default)', () => {
    assert.equal(isValidValue('0'), false);
    assert.equal(isValidValue('0000'), false);
  });
});

describe('radioEngine — generateRandom', () => {
  it('está no range [MIN, MAX]', () => {
    for (let i = 0; i < 50; i++) {
      const v = parseInt(generateRandom(), 10);
      assert.ok(v >= 1000 && v <= 9999, `${v} fora do range`);
    }
  });

  it('exclui valores indicados', () => {
    const exclude = ['5432'];
    for (let i = 0; i < 100; i++) {
      const v = generateRandom({ exclude });
      assert.notEqual(v, '5432');
    }
  });
});

describe('radioEngine — UI', () => {
  it('buildEmbed mostra dash quando não há valor', () => {
    const embed = buildEmbed([]);
    const json = embed.toJSON();
    assert.ok(json.title.includes('Frequências'));
    assert.ok(json.description.includes('—'));
  });

  it('buildEmbed mostra valor quando definido', () => {
    const states = [
      { radio_type: 'principal', value: '1234', mode: 'random', updated_by: 'u1', updated_at: new Date().toISOString() },
      { radio_type: 'parceria',  value: '5678', mode: 'manual', updated_by: 'u2', updated_at: new Date().toISOString() },
    ];
    const json = buildEmbed(states).toJSON();
    assert.ok(json.description.includes('1234'));
    assert.ok(json.description.includes('5678'));
  });

  it('buildComponents devolve 3 rows com botões válidos', () => {
    const rows = buildComponents();
    assert.equal(rows.length, 3);
    for (const r of rows) {
      const json = r.toJSON();
      assert.ok(json.components.length >= 2);
      assert.ok(json.components.length <= 5);
    }
  });

  it('TYPE_META tem principal e parceria', () => {
    assert.ok(TYPE_META.principal);
    assert.ok(TYPE_META.parceria);
  });
});
