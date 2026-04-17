'use strict';
/**
 * Testes do memberEngine — getOrCreateMember, updateMemberRole,
 * deactivateMember. Sem Discord, sem DB real; usa stubs via require.cache.
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

const memberRepoStub = {
  _store: new Map(),
  _findByDiscordIdCalls: 0,
  _createCalls: [],
  _findByIdCalls: 0,
  _promoteCalls: [],
  _updateCalls: [],
  async findByDiscordId(discordId) {
    this._findByDiscordIdCalls++;
    return this._store.get(discordId) || null;
  },
  async findById(id) {
    this._findByIdCalls++;
    // Retorna cópia para simular snapshot — o engine captura beforeState
    // antes do promote mutate-in-place.
    for (const m of this._store.values()) if (m.id === id) return { ...m };
    return null;
  },
  async create({ discordId, username, displayName, role = 'bairrista' }) {
    const member = {
      id: this._store.size + 1,
      discord_id: discordId,
      username,
      display_name: displayName,
      role,
      status: 'ativo',
    };
    this._store.set(discordId, member);
    this._createCalls.push({ discordId, username, displayName });
    return member;
  },
  async promote(memberId, newRole, changedBy, reason) {
    this._promoteCalls.push({ memberId, newRole, changedBy, reason });
    for (const m of this._store.values()) {
      if (m.id === memberId) {
        m.role = newRole;
        return m;
      }
    }
    return null;
  },
  async update(memberId, patch) {
    this._updateCalls.push({ memberId, patch });
    for (const m of this._store.values()) {
      if (m.id === memberId) {
        Object.assign(m, patch);
        return m;
      }
    }
    return null;
  },
  _reset() {
    this._store.clear();
    this._findByDiscordIdCalls = 0;
    this._findByIdCalls = 0;
    this._createCalls.length = 0;
    this._promoteCalls.length = 0;
    this._updateCalls.length = 0;
  },
};

const auditCalls = [];
const auditStub = {
  logAudit: async entry => {
    auditCalls.push(entry);
  },
  sendAuditToChannel: async () => {},
};
function resetAudit() {
  auditCalls.length = 0;
}

require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
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
  exports: auditStub,
};

const { getOrCreateMember, updateMemberRole, deactivateMember } = require('../src/members/memberEngine');

describe('memberEngine — getOrCreateMember', () => {
  beforeEach(() => {
    memberRepoStub._reset();
    resetAudit();
  });

  it('cria se não existe', async () => {
    const m = await getOrCreateMember('111', 'steve', 'Steve');
    assert.equal(m.discord_id, '111');
    assert.equal(m.display_name, 'Steve');
    assert.equal(memberRepoStub._createCalls.length, 1);
  });

  it('reusa se já existe (não chama create)', async () => {
    await getOrCreateMember('222', 'foo', 'Foo');
    memberRepoStub._createCalls.length = 0;
    const m = await getOrCreateMember('222', 'foo', 'Foo');
    assert.equal(m.discord_id, '222');
    assert.equal(memberRepoStub._createCalls.length, 0, 'segunda chamada não deve criar');
  });

  it('default role é bairrista (definido pelo repo)', async () => {
    const m = await getOrCreateMember('333', 'x', 'X');
    assert.equal(m.role, 'bairrista');
  });
});

describe('memberEngine — updateMemberRole', () => {
  beforeEach(() => {
    memberRepoStub._reset();
    resetAudit();
  });

  it('devolve null se membro não existe', async () => {
    const r = await updateMemberRole(999, 'oficial', 'admin', 'tentativa');
    assert.equal(r, null);
    assert.equal(auditCalls.length, 0, 'não deve auditar mudança falhada');
  });

  it('promove e regista audit com before/after', async () => {
    const m = await getOrCreateMember('444', 'u', 'User');
    const updated = await updateMemberRole(m.id, 'oficial', 'admin-id', 'subiu por mérito');

    assert.ok(updated);
    assert.equal(updated.role, 'oficial');
    assert.equal(memberRepoStub._promoteCalls.length, 1);
    assert.equal(memberRepoStub._promoteCalls[0].newRole, 'oficial');
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].action, 'member_role_changed');
    assert.equal(auditCalls[0].beforeState.role, 'bairrista');
    assert.equal(auditCalls[0].afterState.role, 'oficial');
    assert.equal(auditCalls[0].context, 'subiu por mérito');
  });
});

describe('memberEngine — deactivateMember', () => {
  beforeEach(() => {
    memberRepoStub._reset();
    resetAudit();
  });

  it('marca status inativo + regista audit', async () => {
    const m = await getOrCreateMember('555', 'd', 'Down');
    const updated = await deactivateMember(m.id, 'admin-id', 'saiu do servidor');

    assert.equal(updated.status, 'inativo');
    assert.equal(memberRepoStub._updateCalls.length, 1);
    assert.deepEqual(memberRepoStub._updateCalls[0].patch, { status: 'inativo' });
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].action, 'member_deactivated');
    assert.equal(auditCalls[0].actorId, 'admin-id');
    assert.equal(auditCalls[0].context, 'saiu do servidor');
  });

  it('funciona mesmo se repo.update devolver null (membro apagado entre chamadas)', async () => {
    const updated = await deactivateMember(999, 'admin-id', 'race condition');
    assert.equal(updated, null);
    // Audit regista na mesma, com entityId fallback para memberId
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].entityId, '999');
  });
});
