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

describe('Inventory', () => {
  beforeEach(() => {
    mockQuery.mock.resetCalls();
  });

  it('should create an item', async () => {
    const inventoryRepo = require('../src/repositories/inventory');

    mockQuery.mock.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO items')) {
        return { rows: [{ id: 1, name: 'Ferro', category: 'metais', unit: 'unidade', active: true }] };
      }
      return { rows: [] };
    });

    const item = await inventoryRepo.createItem({
      name: 'Ferro', category: 'metais', unit: 'unidade',
    });

    assert.ok(item);
    assert.equal(item.name, 'Ferro');
    assert.equal(item.category, 'metais');
  });

  it('should record a movement', async () => {
    const inventoryRepo = require('../src/repositories/inventory');

    mockQuery.mock.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO inventory_movements')) {
        return { rows: [{ id: 1, movement_type: 'entrega_morador', item_id: 1, quantity: 10 }] };
      }
      return { rows: [] };
    });

    const movement = await inventoryRepo.recordMovement({
      movementType: 'entrega_morador',
      itemId: 1,
      quantity: 10,
      memberId: 1,
      memberRole: 'morador',
      createdBy: '123',
    });

    assert.ok(movement);
    assert.equal(movement.movement_type, 'entrega_morador');
    assert.equal(movement.quantity, 10);
  });

  it('should calculate stock correctly', async () => {
    const inventoryRepo = require('../src/repositories/inventory');

    mockQuery.mock.mockImplementation(async (sql) => {
      if (sql.includes('SUM(')) {
        return {
          rows: [
            { id: 1, name: 'Ferro', category: 'metais', unit: 'unidade', estimated_value: 1, balance: '50' },
            { id: 2, name: 'Aço', category: 'metais', unit: 'unidade', estimated_value: 2, balance: '30' },
          ]
        };
      }
      return { rows: [] };
    });

    const stock = await inventoryRepo.getStock();
    assert.equal(stock.length, 2);
    assert.equal(stock[0].name, 'Ferro');
    assert.equal(stock[0].balance, '50');
  });

  it('should get member totals', async () => {
    const inventoryRepo = require('../src/repositories/inventory');

    mockQuery.mock.mockImplementation(async () => ({
      rows: [
        { movement_type: 'entrega_morador', total: '25' },
        { movement_type: 'venda_morador', total: '10' },
      ]
    }));

    const totals = await inventoryRepo.getMemberTotals(1);
    assert.equal(totals.entrega_morador, 25);
    assert.equal(totals.venda_morador, 10);
  });
});
