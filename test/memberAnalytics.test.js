'use strict';
/**
 * Testes dos handlers de stats pessoais — cobre degradação quando não há
 * dados, formatação dos embeds, e agregação cross-repo.
 *
 * Stub do memberAnalyticsRepo retorna perfis construídos directamente; o
 * objectivo é validar que os handlers constroem embeds correctos.
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) { return require.resolve(path.join(__dirname, '..', 'src', rel)); }

const profiles = { combat: null, material: null, profit: null };

require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  },
};

require.cache[resolved('repositories/index.js')] = {
  exports: {
    memberAnalyticsRepo: {
      getCombatProfile: async () => profiles.combat,
      getMaterialProfile: async () => profiles.material,
      getProfitProfile: async () => profiles.profit,
    },
    memberRepo: {}, inventoryRepo: {}, saidaRepo: {}, operationRepo: {},
    killRepo: {}, spotStatsRepo: {}, memberSaidaStatsRepo: {},
    rankingRepo: {}, auditRepo: {}, jobRepo: {}, availabilityRepo: {},
    radioRepo: {}, stickyRepo: {},
  },
};

require.cache[resolved('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {}, sendAuditToChannel: async () => {} },
};

function fakeInteraction() {
  const captured = { replies: [] };
  return {
    user: { id: 'user-1' },
    deferReply: async () => {},
    followUp: async (payload) => { captured.replies.push(payload); return {}; },
    editReply: async (payload) => { captured.replies.push(payload); return {}; },
    reply: async (payload) => { captured.replies.push(payload); return {}; },
    deleteReply: async () => {},
    replied: false, deferred: true,
    captured,
  };
}

const { handleMyPerformance, handleMyMaterial, handleMyProfit } =
  require('../src/members/memberStatsHandlers');

describe('memberStatsHandlers — stats pessoais', () => {
  beforeEach(() => {
    profiles.combat = null;
    profiles.material = null;
    profiles.profit = null;
  });

  it('performance sem dados devolve mensagem "na rua"', async () => {
    profiles.combat = null;
    const i = fakeInteraction();
    await handleMyPerformance(i);
    const reply = i.captured.replies[0];
    const embed = reply.embeds[0].data;
    assert.match(embed.description, /na rua/i);
  });

  it('performance com dados mostra K/D, MVPs, survival', async () => {
    profiles.combat = {
      memberId: 1, saidasTotal: 10, wins: 7, losses: 2, draws: 1,
      killsTotal: 25, deathsTotal: 5, kdRatio: 5.0,
      survivalRate: 80, mvpCount: 3, profitGenerated: 1500,
      materialReturnRate: 90, weekKills: 4, killRank: 2,
      lastKill: { victim_name: 'Tony', victim_faction: 'Red', spot: 'Docks', created_at: new Date('2026-04-10') },
    };
    const i = fakeInteraction();
    await handleMyPerformance(i);
    const embed = i.captured.replies[0].embeds[0].data;
    const fields = embed.fields.map(f => `${f.name}=${f.value}`).join('|');

    assert.match(fields, /25/, 'kills totais');
    assert.match(fields, /5\.00/, 'K/D');
    assert.match(fields, /80\.0%/, 'survival');
    assert.match(fields, /3/, 'MVPs');
    assert.match(fields, /#2/, 'rank');
    assert.match(fields, /Tony/, 'última kill');
  });

  it('material sem dados devolve mensagem apropriada', async () => {
    profiles.material = null;
    const i = fakeInteraction();
    await handleMyMaterial(i);
    const embed = i.captured.replies[0].embeds[0].data;
    assert.match(embed.description, /não recebeste material/i);
  });

  it('material mostra fornecido/devolvido/perdido + taxa', async () => {
    profiles.material = {
      memberId: 1,
      fornecido: { qty: 20, value: 2000 },
      devolvido: { qty: 15, value: 1500 },
      perdido:   { qty: 3,  value: 300 },
      consumido: { qty: 2,  value: 100 },
      returnRate: 75,
      lossRate: 15,
      topItems: [
        { name: 'M4', qty: 10 },
        { name: 'Colete', qty: 8 },
      ],
    };
    const i = fakeInteraction();
    await handleMyMaterial(i);
    const embed = i.captured.replies[0].embeds[0].data;
    const fields = embed.fields.map(f => `${f.name}=${f.value}`).join('|');

    assert.match(fields, /20×/, 'recebido qty');
    assert.match(fields, /75\.0%/, 'taxa devolução');
    assert.match(fields, /15\.0%/, 'taxa perda');
    assert.match(fields, /M4/, 'top item');
  });

  it('lucro sem dados devolve mensagem apropriada', async () => {
    profiles.profit = null;
    const i = fakeInteraction();
    await handleMyProfit(i);
    const embed = i.captured.replies[0].embeds[0].data;
    assert.match(embed.description, /ainda não fechaste/i);
  });

  it('lucro mostra spots, saídas recentes, MVP flag', async () => {
    profiles.profit = {
      memberId: 1,
      profitGenerated: 3500,
      saidasTotal: 12,
      topSpots: [
        { spot: 'Docks', saidas: 5, net_delta: 2000, wins: 4, kills: 15 },
        { spot: 'Plaza', saidas: 3, net_delta: 1200, wins: 2, kills: 8 },
      ],
      recentSaidas: [
        { id: 42, date: new Date('2026-04-12'), spot: 'Docks', result: 'win', operation_type: 'ataque', kills: 3, died: false, mvp_flag: true },
        { id: 40, date: new Date('2026-04-10'), spot: 'Plaza', result: 'loss', operation_type: 'defesa', kills: 1, died: true, mvp_flag: false },
      ],
    };
    const i = fakeInteraction();
    await handleMyProfit(i);
    const embed = i.captured.replies[0].embeds[0].data;
    const fields = embed.fields.map(f => `${f.name}=${f.value}`).join('|');

    assert.match(fields, /Docks/, 'top spot');
    assert.match(fields, /🥇.*Docks/, 'medalha ouro no primeiro');
    assert.match(fields, /#42/, 'saída 42');
    assert.match(fields, /#40/, 'saída 40');
  });
});
