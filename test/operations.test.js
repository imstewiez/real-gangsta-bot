'use strict';
const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

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

describe('Operations', () => {
  beforeEach(() => {
    mockQuery.mock.resetCalls();
  });

  it('should create an operation', async () => {
    const operationRepo = require('../src/repositories/operation');

    mockQuery.mock.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO operations')) {
        return { rows: [{ id: 1, operation_type: 'craft', status: 'aberta', date: '2026-04-13' }] };
      }
      return { rows: [] };
    });

    const op = await operationRepo.create({
      date: '2026-04-13', scheduledTime: '21:30', spot: 'Zona Norte',
      operationType: 'craft', leaderId: null, groupNumber: 1,
      maxParticipants: 12, notes: '', createdBy: '123',
    });

    assert.ok(op);
    assert.equal(op.operation_type, 'craft');
    assert.equal(op.status, 'aberta');
  });

  it('should add participant to operation', async () => {
    const operationRepo = require('../src/repositories/operation');

    mockQuery.mock.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO operation_participants')) {
        return { rows: [{ id: 1, operation_id: 1, member_id: 1, role_in_op: 'membro' }] };
      }
      return { rows: [] };
    });

    const participant = await operationRepo.addParticipant(1, 1, {
      roleInOp: 'membro', broughtOwn: false, receivedOrg: true,
    });

    assert.ok(participant);
    assert.equal(participant.operation_id, 1);
  });

  it('should find open operations', async () => {
    const operationRepo = require('../src/repositories/operation');

    mockQuery.mock.mockImplementation(async () => ({
      rows: [
        { id: 1, operation_type: 'craft', status: 'aberta' },
        { id: 2, operation_type: 'ataque', status: 'em_curso' },
      ]
    }));

    const ops = await operationRepo.findOpen();
    assert.equal(ops.length, 2);
  });

  it('should get material summary', async () => {
    const operationRepo = require('../src/repositories/operation');

    mockQuery.mock.mockImplementation(async () => ({
      rows: [
        { direction: 'fornecido', total: '50', weighted_total: '100' },
        { direction: 'devolvido', total: '30', weighted_total: '60' },
        { direction: 'perdido', total: '5', weighted_total: '10' },
      ]
    }));

    const summary = await operationRepo.getMaterialSummary(1);
    assert.equal(summary.fornecido.total, 50);
    assert.equal(summary.devolvido.total, 30);
    assert.equal(summary.perdido.total, 5);
  });
});
