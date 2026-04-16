'use strict';
/**
 * Testes da nova ordem de tiers e do PROMOTIONS chain.
 * Sem Discord, sem DB — apenas valida a estrutura estática que outros
 * módulos consomem (autoPromotionEngine + roleInvariants + tierFixCommand).
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
// db.js faz process.exit(1) sem DATABASE_URL — dummy pool nunca é usado nos testes.
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

// Stub db + repositories antes de carregar autoPromotionEngine — evita
// abrir pool real só para inspeccionar a estrutura estática.
function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}
require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    acquireInstanceLockWithRetry: async () => true,
    releaseInstanceLock: async () => {},
  },
};
require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: { findByDiscordId: async () => null },
    inventoryRepo: {},
    operationRepo: {},
    rankingRepo: {},
    auditRepo: {},
    jobRepo: {},
  },
};

// CONFIG isolado — pega apenas os defaults estáticos
const CONFIG = require('../src/config');

describe('tier hierarchy & promotion chain', () => {
  it('BAIRRISTA_TIER_ROLE_IDS está na ordem entry → topo', () => {
    // Young Blood (entry) → O Gunão (mid) → Gangster Fodido (topo)
    const ids = CONFIG.BAIRRISTA_TIER_ROLE_IDS;
    assert.equal(ids.length, 3, 'esperam-se 3 tiers configurados');
    assert.equal(ids[0], CONFIG.YOUNG_BLOOD_ROLE_ID, '[0] deve ser YOUNG_BLOOD');
    assert.equal(ids[1], CONFIG.O_GUNAO_ROLE_ID, '[1] deve ser O_GUNAO');
    assert.equal(ids[2], CONFIG.GANGSTER_FODIDO_ROLE_ID, '[2] deve ser GANGSTER_FODIDO');
  });

  it('BAIRRISTA_DEFAULT_TIER é young_blood', () => {
    assert.equal(CONFIG.BAIRRISTA_DEFAULT_TIER, 'young_blood');
  });

  it('thresholds default são 25k → 50k', () => {
    assert.equal(CONFIG.PROMO_YOUNG_BLOOD_TO_GUNAO, 25000);
    assert.equal(CONFIG.PROMO_GUNAO_TO_GANGSTER_FODIDO, 50000);
  });

  it('PROMOTIONS encadeia young_blood → o_gunao → gangster_fodido', () => {
    const { PROMOTIONS, TIERS } = require('../src/members/autoPromotionEngine');
    assert.equal(TIERS[0].tier, 'young_blood');
    assert.equal(TIERS[1].tier, 'o_gunao');
    assert.equal(TIERS[2].tier, 'gangster_fodido');

    assert.equal(PROMOTIONS.length, 2);
    assert.equal(PROMOTIONS[0].from, 'young_blood');
    assert.equal(PROMOTIONS[0].to, 'o_gunao');
    assert.equal(PROMOTIONS[0].thresholdKey, 'PROMO_YOUNG_BLOOD_TO_GUNAO');
    assert.equal(PROMOTIONS[1].from, 'o_gunao');
    assert.equal(PROMOTIONS[1].to, 'gangster_fodido');
    assert.equal(PROMOTIONS[1].thresholdKey, 'PROMO_GUNAO_TO_GANGSTER_FODIDO');
  });

  it('TIER_LABEL e TIER_EMOJI mantêm as três chaves', () => {
    const { TIER_LABEL, TIER_EMOJI } = require('../src/discord/structureTemplate');
    for (const tier of ['o_gunao', 'young_blood', 'gangster_fodido']) {
      assert.ok(TIER_LABEL[tier], `TIER_LABEL.${tier} em falta`);
      assert.ok(TIER_EMOJI[tier], `TIER_EMOJI.${tier} em falta`);
    }
  });

  it('formatResidentChannelName usa tier de entrada (young_blood)', () => {
    const { formatResidentChannelName } = require('../src/discord/structureTemplate');
    const name = formatResidentChannelName('young_blood', 'tester');
    // emoji・𝗬𝗼𝘂𝗻𝗴 𝗕𝗹𝗼𝗼𝗱 - 𝘁𝗲𝘀𝘁𝗲𝗿
    assert.match(name, /^.+・.+ - .+$/, 'formato emoji・Tier - Nick');
    assert.ok(name.startsWith('🍼'), 'tier young_blood deve começar com 🍼');
  });
});

describe('PROMOTIONS thresholds via env fallback', () => {
  it('lê nomes Fase-2 (PROMO_GUNAO_TO_YOUNG_BLOOD) como fallback do threshold 25k', () => {
    // Limpa vars novas, define só as de Fase 2
    delete process.env.PROMO_YOUNG_BLOOD_TO_GUNAO;
    delete process.env.PROMO_GUNAO_TO_GANGSTER_FODIDO;
    process.env.PROMO_GUNAO_TO_YOUNG_BLOOD = '12345';
    process.env.PROMO_YOUNG_BLOOD_TO_GANGSTER_FODIDO = '67890';

    const cfgPath = require.resolve('../src/config');
    delete require.cache[cfgPath];
    const fresh = require('../src/config');

    assert.equal(fresh.PROMO_YOUNG_BLOOD_TO_GUNAO, 12345);
    assert.equal(fresh.PROMO_GUNAO_TO_GANGSTER_FODIDO, 67890);

    // Cleanup
    delete process.env.PROMO_GUNAO_TO_YOUNG_BLOOD;
    delete process.env.PROMO_YOUNG_BLOOD_TO_GANGSTER_FODIDO;
    delete require.cache[cfgPath];
  });
});
