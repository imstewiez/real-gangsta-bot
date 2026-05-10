'use strict';
/**
 * Unit tests para killEngine — validações de domínio (self-kill, removed,
 * daily rate limit).
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', '..', '..', 'src', rel));
}

const state = {
  members: new Map(),
  killsToday: 0,
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
};

const stubKillRepo = {
  recordKill: async data => ({ id: 1, ...data, created_at: new Date() }),
  countKillsToday: async () => state.killsToday,
};

const stubSaidaRepo = {
  findById: async id => ({ id, status: 'em_curso' }),
  getParticipants: async () => [...state.members.values()].map(m => ({ member_id: m.id })),
};

require.cache[resolved('repositories/index.js')] = {
  exports: {
    memberRepo: stubMemberRepo,
    killRepo: stubKillRepo,
    saidaRepo: stubSaidaRepo,
    inventoryRepo: {},
    operationRepo: stubSaidaRepo,
    spotStatsRepo: {},
    memberSaidaStatsRepo: {},
    memberAnalyticsRepo: {},
    rankingRepo: {},
    auditRepo: {},
    jobRepo: {},
    availabilityRepo: {},
    radioRepo: {},
    stickyRepo: {},
    monthlyRankingRepo: {},
  },
};
require.cache[resolved('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {}, sendAuditToChannel: async () => {} },
};
require.cache[resolved('lib/metrics.js')] = {
  exports: new Proxy({}, { get: () => ({ inc: () => {}, set: () => {} }) }),
};

const { recordKill } = require('../../../src/kills/killEngine');

describe('killEngine — validações de domínio', () => {
  beforeEach(() => {
    state.members.clear();
    state.killsToday = 0;
    state.members.set('killer-1', {
      id: 1,
      discord_id: 'killer-1',
      display_name: 'Killer1',
      status: 'ativo',
    });
  });

  it('rejeita auto-kill', async () => {
    await assert.rejects(
      recordKill({
        killerDiscordId: 'killer-1',
        victimName: 'Self',
        victimDiscordId: 'killer-1',
        createdBy: 'actor',
      }),
      /Auto-kill não permitido/
    );
  });

  it('rejeita membro removido (status)', async () => {
    state.members.set('removed-1', {
      id: 2,
      discord_id: 'removed-1',
      display_name: 'Removed',
      status: 'removed',
    });
    await assert.rejects(
      recordKill({
        killerDiscordId: 'removed-1',
        victimName: 'Victim',
        createdBy: 'actor',
      }),
      /Membro removido/
    );
  });

  it('rejeita membro removido (lifecycle_state)', async () => {
    state.members.set('removed-2', {
      id: 3,
      discord_id: 'removed-2',
      display_name: 'RemovedLC',
      status: 'ativo',
      lifecycle_state: 'removed',
    });
    await assert.rejects(
      recordKill({
        killerDiscordId: 'removed-2',
        victimName: 'Victim',
        createdBy: 'actor',
      }),
      /Membro removido/
    );
  });

  it('rejeita quando limite diário é atingido', async () => {
    state.killsToday = 50;
    await assert.rejects(
      recordKill({
        killerDiscordId: 'killer-1',
        victimName: 'Victim',
        createdBy: 'actor',
      }),
      /Limite diário de kills atingido \(50\/dia\)/
    );
  });

  it('permite kill quando abaixo do limite diário', async () => {
    state.killsToday = 49;
    const kill = await recordKill({
      killerDiscordId: 'killer-1',
      victimName: 'Victim',
      createdBy: 'actor',
    });
    assert.equal(kill.victimName, 'Victim');
  });

  it('limite diário respeita CONFIG.KILL_DAILY_LIMIT', async () => {
    const CONFIG = require('../../../src/config');
    CONFIG.KILL_DAILY_LIMIT = 5;
    state.killsToday = 5;
    await assert.rejects(
      recordKill({
        killerDiscordId: 'killer-1',
        victimName: 'Victim',
        createdBy: 'actor',
      }),
      /Limite diário de kills atingido \(5\/dia\)/
    );
    delete CONFIG.KILL_DAILY_LIMIT;
  });
});
