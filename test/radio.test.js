'use strict';

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= '12345678901234567';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';
process.env.RADIO_RANDOM_MIN = '30';
process.env.RADIO_RANDOM_MAX = '4500';
process.env.RADIO_ALLOW_ZERO = 'false';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

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
    availabilityRepo: {},
    radioRepo: {
      getAllStates: async () => [],
      setState: async x => ({ ...x, previous: '' }),
      listHistory: async () => [],
    },
  },
};
require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {} },
};

delete require.cache[resolvedPath('config/index.js')];
delete require.cache[resolvedPath('config/radio.js')];
delete require.cache[resolvedPath('radio/radioEngine.js')];

const { isValidValue, generateRandom, buildEmbed, buildComponents, TYPE_META } = require('../src/radio/radioEngine');

describe('radioEngine validation', () => {
  it('accepts values inside range 30-4500', () => {
    assert.equal(isValidValue('30'), true);
    assert.equal(isValidValue('4500'), true);
    assert.equal(isValidValue('1234'), true);
  });

  it('rejects values outside range', () => {
    assert.equal(isValidValue('29'), false);
    assert.equal(isValidValue('4501'), false);
    assert.equal(isValidValue('-5'), false);
  });

  it('rejects non-numeric values', () => {
    assert.equal(isValidValue('abc'), false);
    assert.equal(isValidValue('12a'), false);
    assert.equal(isValidValue(''), false);
    assert.equal(isValidValue(null), false);
  });

  it('rejects 0 when RADIO_ALLOW_ZERO=false', () => {
    assert.equal(isValidValue('0'), false);
    assert.equal(isValidValue('0000'), false);
  });
});

describe('radioEngine generateRandom', () => {
  it('stays inside [MIN, MAX]', () => {
    for (let i = 0; i < 50; i++) {
      const value = parseInt(generateRandom(), 10);
      assert.ok(value >= 30 && value <= 4500, `${value} outside range`);
    }
  });

  it('excludes requested values', () => {
    const exclude = ['5432'];
    for (let i = 0; i < 100; i++) {
      assert.notEqual(generateRandom({ exclude }), '5432');
    }
  });
});

describe('radioEngine UI', () => {
  it('buildEmbed shows dash when no value is set', () => {
    const json = buildEmbed([]).toJSON();
    assert.ok(json.title.includes('Frequencia da Ballas Gang') || json.title.includes('Frequência da Ballas Gang'));
    assert.ok(json.description.includes('-') || json.description.includes('—'));
  });

  it('buildEmbed shows the defined value', () => {
    const states = [
      {
        radio_type: 'principal',
        value: '1234',
        mode: 'random',
        updated_by: 'u1',
        updated_at: new Date().toISOString(),
      },
    ];
    const json = buildEmbed(states).toJSON();
    assert.ok(json.description.includes('1234'));
  });

  it('buildComponents returns 1 row with 1 button', () => {
    const rows = buildComponents();
    assert.equal(rows.length, 1);
    const json = rows[0].toJSON();
    assert.equal(json.components.length, 1);
    assert.ok(json.components[0].custom_id.startsWith('radio::random::'));
  });

  it('TYPE_META only contains principal', () => {
    assert.ok(TYPE_META.principal);
    assert.equal(TYPE_META.parceria, undefined);
  });
});
