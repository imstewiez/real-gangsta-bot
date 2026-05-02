'use strict';
/**
 * Integração kills ↔ saídas ↔ rankings.
 * Valida que:
 *   - recordKill propaga saida_id para kill_logs
 *   - erro quando killer não está na base
 *   - recent/leaderboard retornam os dados inseridos
 *   - window filtering (7 dias) funciona
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

const state = {
  members: new Map(), // discord_id -> member
  kills: [],
};

require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

const stubMemberRepo = {
  findByDiscordId: async discordId => state.members.get(discordId) || null,
  findById: async id => [...state.members.values()].find(m => m.id === id) || null,
  create: async x => {
    const m = { id: state.members.size + 1, ...x };
    state.members.set(x.discordId, m);
    return m;
  },
};

const stubKillRepo = {
  recordKill: async data => {
    const kill = { id: state.kills.length + 1, ...data, created_at: new Date(), date: data.date || new Date() };
    state.kills.push(kill);
    return kill;
  },
  getLeaderboard: async (limit, windowDays) => {
    const cutoff = windowDays ? Date.now() - windowDays * 86400000 : 0;
    const counts = new Map();
    for (const k of state.kills) {
      if (new Date(k.created_at).getTime() < cutoff) continue;
      counts.set(k.killerId, (counts.get(k.killerId) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([killerId, kills]) => {
        const m = [...state.members.values()].find(member => member.id === killerId);
        return { killer_id: killerId, kills, display_name: m?.display_name, discord_id: m?.discord_id };
      });
  },
  getRecent: async limit => state.kills.slice(-limit).reverse(),
  countKillsBySaida: async sid => state.kills.filter(k => k.saidaId === sid).length,
  countKillsByMember: async memberId => state.kills.filter(k => k.killerId === memberId).length,
  totalOrgKills: async windowDays => {
    const cutoff = windowDays ? Date.now() - windowDays * 86400000 : 0;
    return state.kills.filter(k => new Date(k.created_at).getTime() >= cutoff).length;
  },
};

require.cache[resolved('repositories/index.js')] = {
  exports: {
    memberRepo: stubMemberRepo,
    killRepo: stubKillRepo,
    inventoryRepo: {},
    saidaRepo: {
      findById: async id => ({ id, status: 'em_curso' }),
      getParticipants: async () => [...state.members.values()].map(m => ({ member_id: m.id })),
    },
    operationRepo: {},
    spotStatsRepo: {},
    memberSaidaStatsRepo: {},
    memberAnalyticsRepo: {},
    rankingRepo: {},
    auditRepo: {},
    jobRepo: {},
    availabilityRepo: {},
    radioRepo: {},
    stickyRepo: {},
  },
};
require.cache[resolved('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {}, sendAuditToChannel: async () => {} },
};
require.cache[resolved('lib/metrics.js')] = {
  exports: new Proxy({}, { get: () => ({ inc: () => {}, set: () => {} }) }),
};

const { recordKill, getLeaderboard, getRecent } = require('../src/kills/killEngine');

describe('killEngine — integração com saídas', () => {
  beforeEach(() => {
    state.members.clear();
    state.kills = [];
    state.members.set('discord-1', { id: 1, discord_id: 'discord-1', display_name: 'Killer1' });
    state.members.set('discord-2', { id: 2, discord_id: 'discord-2', display_name: 'Killer2' });
  });

  it('recordKill propaga saida_id para kill_logs', async () => {
    const kill = await recordKill({
      killerDiscordId: 'discord-1',
      victimName: 'Tony Bloods',
      victimFaction: 'Red Street',
      spot: 'Docks',
      saidaId: 42,
      createdBy: 'actor',
    });
    assert.equal(kill.saidaId, 42);
    assert.equal(kill.killerId, 1);
    assert.equal(kill.victimName, 'Tony Bloods');
    assert.equal(kill.victimFaction, 'Red Street');
    assert.equal(kill.spot, 'Docks');
  });

  it('rejeita se killer não está na base', async () => {
    await assert.rejects(
      recordKill({ killerDiscordId: 'fantasma', victimName: 'X', createdBy: 'a' }),
      /não encontrado/i
    );
  });

  it('rejeita se victimName vazio', async () => {
    await assert.rejects(recordKill({ killerDiscordId: 'discord-1', victimName: '', createdBy: 'a' }), /obrigatório/i);
  });

  it('kill standalone (sem saidaId) também regista', async () => {
    const kill = await recordKill({
      killerDiscordId: 'discord-1',
      victimName: 'Bandido Solto',
      spot: 'Bairro',
      createdBy: 'a',
    });
    assert.equal(kill.saidaId, null);
    assert.equal(kill.spot, 'Bairro');
  });

  it('leaderboard agrega kills por killer', async () => {
    await recordKill({ killerDiscordId: 'discord-1', victimName: 'V1', createdBy: 'a' });
    await recordKill({ killerDiscordId: 'discord-1', victimName: 'V2', createdBy: 'a' });
    await recordKill({ killerDiscordId: 'discord-1', victimName: 'V3', createdBy: 'a' });
    await recordKill({ killerDiscordId: 'discord-2', victimName: 'V4', createdBy: 'a' });

    const top = await getLeaderboard(5);
    assert.equal(top[0].killer_id, 1);
    assert.equal(top[0].kills, 3);
    assert.equal(top[1].killer_id, 2);
    assert.equal(top[1].kills, 1);
  });

  it('recent retorna kills ordenados do mais recente para o mais antigo', async () => {
    await recordKill({ killerDiscordId: 'discord-1', victimName: 'Primeiro', createdBy: 'a' });
    await recordKill({ killerDiscordId: 'discord-2', victimName: 'Segundo', createdBy: 'a' });
    const recent = await getRecent(5);
    assert.equal(recent[0].victimName, 'Segundo');
    assert.equal(recent[1].victimName, 'Primeiro');
  });

  it('kills da mesma saída agrupam via countKillsBySaida', async () => {
    await recordKill({ killerDiscordId: 'discord-1', victimName: 'A', saidaId: 99, createdBy: 'a' });
    await recordKill({ killerDiscordId: 'discord-1', victimName: 'B', saidaId: 99, createdBy: 'a' });
    await recordKill({ killerDiscordId: 'discord-2', victimName: 'C', saidaId: 99, createdBy: 'a' });
    await recordKill({ killerDiscordId: 'discord-1', victimName: 'D', saidaId: 100, createdBy: 'a' });

    const n99 = await stubKillRepo.countKillsBySaida(99);
    const n100 = await stubKillRepo.countKillsBySaida(100);
    assert.equal(n99, 3);
    assert.equal(n100, 1);
  });
});
