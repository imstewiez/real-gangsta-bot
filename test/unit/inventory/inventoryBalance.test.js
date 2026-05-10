'use strict';
/**
 * Unit tests para inventoryBalance repository.
 * Mock do db.js para validar queries emitidas sem tocar na DB.
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', '..', '..', 'src', rel));
}

const _captured = [];
let _nextRows = [];

require.cache[resolvedPath('db.js')] = {
  exports: {
    query: async (sql, values) => {
      _captured.push({ sql, values });
      return { rows: _nextRows.shift() || [] };
    },
  },
};

const inventoryBalance = require('../../../src/repositories/inventoryBalance');

describe('inventoryBalance', () => {
  beforeEach(() => {
    _captured.length = 0;
    _nextRows = [];
  });

  it('recalculateBalance corre SUM e faz UPSERT', async () => {
    _nextRows = [[{ balance: 42 }], []];
    const balance = await inventoryBalance.recalculateBalance(1, 'armazem');
    assert.equal(balance, 42);
    assert.ok(_captured[0].sql.includes('SUM'));
    assert.ok(_captured[1].sql.includes('INSERT INTO inventory_balance'));
    assert.ok(_captured[1].sql.includes('ON CONFLICT'));
    assert.deepEqual(_captured[1].values, [1, 'armazem', 42]);
  });

  it('getBalance devolve balance existente', async () => {
    _nextRows = [[{ balance: 100 }]];
    const balance = await inventoryBalance.getBalance(5, 'grupo');
    assert.equal(balance, 100);
    assert.ok(_captured[0].sql.includes('FROM inventory_balance'));
    assert.deepEqual(_captured[0].values, [5, 'grupo']);
  });

  it('getBalance faz fallback a recalculateBalance se row não existe', async () => {
    _nextRows = [[], [{ balance: 7 }], []];
    const balance = await inventoryBalance.getBalance(3, 'armazem');
    assert.equal(balance, 7);
    assert.equal(_captured.length, 3);
    assert.ok(_captured[0].sql.includes('FROM inventory_balance'));
    assert.ok(_captured[1].sql.includes('SUM'));
  });

  it('touchBalance faz UPSERT com delta', async () => {
    _nextRows = [[{ balance: 15 }]];
    const balance = await inventoryBalance.touchBalance(2, 'armazem', -3);
    assert.equal(balance, 15);
    assert.ok(_captured[0].sql.includes('INSERT INTO inventory_balance'));
    assert.ok(_captured[0].sql.includes('inventory_balance.balance + $3'));
    assert.deepEqual(_captured[0].values, [2, 'armazem', -3]);
  });

  it('touchBalance aceita client para transacção', async () => {
    const fakeClient = {
      query: async (sql, values) => {
        _captured.push({ sql, values, client: true });
        return { rows: [{ balance: 20 }] };
      },
    };
    _nextRows = [];
    const balance = await inventoryBalance.touchBalance(2, 'grupo', 5, fakeClient);
    assert.equal(balance, 20);
    assert.equal(_captured.length, 1);
    assert.ok(_captured[0].client);
  });

  it('touchBalance default location é armazem', async () => {
    _nextRows = [[{ balance: 0 }]];
    await inventoryBalance.touchBalance(1, null, 10);
    assert.equal(_captured[0].values[1], 'armazem');
  });
});
