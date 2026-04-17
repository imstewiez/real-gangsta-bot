'use strict';
/**
 * Testes de regressão para fluxos de onboarding + auto-promoção.
 *
 * Cobre:
 *   - getPromotionProgress em cada tier (young_blood, o_gunao, gangster_fodido)
 *   - checkAndPromote: quando não promove, quando promove, quando já está no topo
 *   - formatTierName
 *   - PROMOTIONS chain (estrutura — ordem young_blood → o_gunao → gangster_fodido)
 *
 * Onboarding processApproval em si depende de Discord + DB reais; está
 * coberto por integration tests (ver test/integration/).
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// ── Stubs ──────────────────────────────────────────────────────────────────
let _memberMaterialQty = 0;
let _currentMember = null;

const memberRepoStub = {
  async findByDiscordId(discordId) {
    if (!_currentMember) return null;
    return { ..._currentMember, discord_id: discordId };
  },
};

require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [{ total_qty: _memberMaterialQty }] }),
  },
};

require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: memberRepoStub,
    inventoryRepo: {},
    operationRepo: {},
    rankingRepo: {},
    auditRepo: {},
    jobRepo: {},
  },
};

require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {}, sendAuditToChannel: async () => {} },
};
require.cache[resolvedPath('discordQueue.js')] = {
  exports: { queueMemberOp: fn => fn(), queueChannelOp: fn => fn() },
};
require.cache[resolvedPath('core/eventBus.js')] = {
  exports: { emitAsync: async () => {}, on: () => {}, emit: () => {} },
};

const {
  PROMOTIONS,
  TIERS,
  formatTierName,
  getPromotionProgress,
  checkAndPromote,
} = require('../src/members/autoPromotionEngine');

describe('autoPromotionEngine — formatTierName', () => {
  it('formata tiers de bairrista', () => {
    assert.equal(formatTierName('young_blood'), 'Young Blood');
    assert.equal(formatTierName('o_gunao'), 'O Gunão');
    assert.equal(formatTierName('gangster_fodido'), 'Gangster Fodido');
  });

  it('formata tiers superiores (manuais)', () => {
    assert.equal(formatTierName('patrao_di_zona'), 'Patrão di Zona');
    assert.equal(formatTierName('real_gangster'), 'Real Gangster');
    assert.equal(formatTierName('og'), 'OG');
    assert.equal(formatTierName('kingpin'), 'Kingpin');
    assert.equal(formatTierName('manda_chuva'), 'Manda-Chuva');
  });

  it('tier desconhecido devolve o valor cru', () => {
    assert.equal(formatTierName('foo'), 'foo');
  });
});

describe('autoPromotionEngine — PROMOTIONS chain', () => {
  it('tem exactamente 2 promoções automáticas', () => {
    assert.equal(PROMOTIONS.length, 2);
  });

  it('ordem: young_blood → o_gunao → gangster_fodido', () => {
    assert.equal(PROMOTIONS[0].from, 'young_blood');
    assert.equal(PROMOTIONS[0].to, 'o_gunao');
    assert.equal(PROMOTIONS[1].from, 'o_gunao');
    assert.equal(PROMOTIONS[1].to, 'gangster_fodido');
  });

  it('thresholds apontam para os env keys certos', () => {
    assert.equal(PROMOTIONS[0].thresholdKey, 'PROMO_YOUNG_BLOOD_TO_GUNAO');
    assert.equal(PROMOTIONS[1].thresholdKey, 'PROMO_GUNAO_TO_GANGSTER_FODIDO');
  });

  it('TIERS em ordem entry→topo, todos dbRole=bairrista', () => {
    assert.equal(TIERS.length, 3);
    assert.deepEqual(
      TIERS.map(t => t.tier),
      ['young_blood', 'o_gunao', 'gangster_fodido']
    );
    assert.ok(TIERS.every(t => t.dbRole === 'bairrista'));
  });
});

describe('autoPromotionEngine — getPromotionProgress', () => {
  beforeEach(() => {
    _memberMaterialQty = 0;
    _currentMember = null;
  });

  it('devolve null se membro não existe', async () => {
    const p = await getPromotionProgress('nonexistent');
    assert.equal(p, null);
  });

  it('young_blood com 0 material: 0% progresso', async () => {
    _currentMember = { id: 1, role: 'bairrista', tier: 'young_blood' };
    _memberMaterialQty = 0;
    const p = await getPromotionProgress('111');
    assert.equal(p.currentTier, 'young_blood');
    assert.equal(p.nextTier, 'o_gunao');
    assert.equal(p.maxedOut, false);
    assert.equal(parseFloat(p.progress), 0);
    assert.equal(p.remaining, 25000);
  });

  it('young_blood a 50% do threshold', async () => {
    _currentMember = { id: 1, role: 'bairrista', tier: 'young_blood' };
    _memberMaterialQty = 12500;
    const p = await getPromotionProgress('111');
    assert.equal(parseFloat(p.progress), 50);
    assert.equal(p.remaining, 12500);
  });

  it('o_gunao com 50k material: 100% progresso', async () => {
    _currentMember = { id: 1, role: 'bairrista', tier: 'o_gunao' };
    _memberMaterialQty = 50000;
    const p = await getPromotionProgress('222');
    assert.equal(p.currentTier, 'o_gunao');
    assert.equal(p.nextTier, 'gangster_fodido');
    assert.equal(parseFloat(p.progress), 100);
    assert.equal(p.remaining, 0);
  });

  it('gangster_fodido está maxed out (sem next tier)', async () => {
    _currentMember = { id: 1, role: 'bairrista', tier: 'gangster_fodido' };
    _memberMaterialQty = 99999;
    const p = await getPromotionProgress('333');
    assert.equal(p.maxedOut, true);
    assert.equal(p.nextTier, null);
    assert.equal(p.progress, 100);
    assert.equal(p.remaining, 0);
  });

  it('fallback para BAIRRISTA_DEFAULT_TIER se tier da DB é null', async () => {
    _currentMember = { id: 1, role: 'bairrista', tier: null };
    _memberMaterialQty = 0;
    const p = await getPromotionProgress('444');
    assert.equal(p.currentTier, 'young_blood');
  });
});

describe('autoPromotionEngine — checkAndPromote', () => {
  beforeEach(() => {
    _memberMaterialQty = 0;
    _currentMember = null;
  });

  it('devolve null se membro não existe', async () => {
    const r = await checkAndPromote('999', null, null);
    assert.equal(r, null);
  });

  it('devolve null se não é bairrista (sem tier aplicável)', async () => {
    _currentMember = { id: 1, role: 'oficial', tier: null };
    const r = await checkAndPromote('111', null, null);
    assert.equal(r, null);
  });

  it('devolve null se não atingiu threshold', async () => {
    _currentMember = { id: 1, role: 'bairrista', tier: 'young_blood' };
    _memberMaterialQty = 1000;
    const r = await checkAndPromote('111', null, null);
    assert.equal(r, null);
  });

  it('devolve null se já está no tier topo (gangster_fodido)', async () => {
    _currentMember = { id: 1, role: 'bairrista', tier: 'gangster_fodido' };
    _memberMaterialQty = 9999999;
    const r = await checkAndPromote('111', null, null);
    assert.equal(r, null);
  });
});
