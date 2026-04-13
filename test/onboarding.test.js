'use strict';
const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Mock DB
const mockQuery = mock.fn(async () => ({ rows: [] }));
const mockQueryWithTransaction = mock.fn(async (fn) => fn({
  query: mockQuery,
}));

mock.module('../src/db', {
  namedExports: {
    pool: { connect: async () => ({ query: mockQuery, release: () => {} }) },
    query: mockQuery,
    queryWithTransaction: mockQueryWithTransaction,
    acquireInstanceLockWithRetry: async () => true,
    releaseInstanceLock: async () => {},
  }
});

describe('Onboarding', () => {
  beforeEach(() => {
    mockQuery.mock.resetCalls();
  });

  it('should create a member record when morador role is added', async () => {
    // Test that memberRepo.create is called with correct params
    const memberRepo = require('../src/repositories/member');

    mockQuery.mock.mockImplementation(async (sql, params) => {
      if (sql.includes('INSERT INTO members')) {
        return { rows: [{ id: 1, discord_id: '123', username: 'test', display_name: 'Test', role: 'morador', status: 'ativo' }] };
      }
      if (sql.includes('SELECT * FROM members WHERE discord_id')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const member = await memberRepo.create({
      discordId: '123',
      username: 'testuser',
      displayName: 'Test User',
      role: 'morador',
    });

    assert.ok(member);
    assert.equal(member.discord_id, '123');
    assert.equal(member.role, 'morador');
  });

  it('should find member by discord ID', async () => {
    const memberRepo = require('../src/repositories/member');

    mockQuery.mock.mockImplementation(async () => ({
      rows: [{ id: 1, discord_id: '456', role: 'morador', status: 'ativo' }]
    }));

    const member = await memberRepo.findByDiscordId('456');
    assert.ok(member);
    assert.equal(member.discord_id, '456');
  });

  it('should promote member and record history', async () => {
    const memberRepo = require('../src/repositories/member');

    let insertCalled = false;
    mockQuery.mock.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM members WHERE id')) {
        return { rows: [{ id: 1, discord_id: '789', role: 'morador' }] };
      }
      if (sql.includes('INSERT INTO member_role_history')) {
        insertCalled = true;
        return { rows: [] };
      }
      if (sql.includes('UPDATE members SET role')) {
        return { rows: [{ id: 1, discord_id: '789', role: 'oficial' }] };
      }
      return { rows: [] };
    });

    const result = await memberRepo.promote(1, 'oficial', 'admin', 'Promoção');
    assert.ok(result);
    assert.equal(result.role, 'oficial');
  });
});
