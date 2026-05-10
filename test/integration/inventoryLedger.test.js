'use strict';
/**
 * Integration — inventory ledger end-to-end:
 *   - Inserir movements de vários tipos
 *   - Verificar que getStockForItem devolve balance correcto
 *   - Confirmar que fornecimento_org desconta, entrega adiciona, etc.
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { haveDb, cleanState } = require('./_helpers');

if (!haveDb()) {
  describe('integration/inventoryLedger', { skip: 'DATABASE_URL em falta' }, () => {});
  return;
}

const { query } = require('../../src/db');
const inventoryRepo = require('../../src/repositories/inventory');

let _itemId, _memberId;

describe('integration/inventoryLedger', () => {
  before(async () => {
    await cleanState(query);
    // Setup: 1 item + 1 member para servir de âncora em todos os testes.
    await query(
      `INSERT INTO items (name, category, unit, estimated_value, active)
       VALUES ('test-item-ledger', 'outros', 'unidade', 10, true)`
    );
    const i = await query("SELECT id FROM items WHERE name = 'test-item-ledger'");
    _itemId = i.rows[0].id;
    await query(
      `INSERT INTO members (discord_id, username, display_name, role)
       VALUES ('ledger-test-member', 'lt', 'LT', 'bairrista')`
    );
    const m = await query("SELECT id FROM members WHERE discord_id = 'ledger-test-member'");
    _memberId = m.rows[0].id;
  });

  beforeEach(async () => {
    await query('DELETE FROM inventory_movements WHERE item_id = $1', [_itemId]);
  });

  after(async () => {
    await query('DELETE FROM inventory_movements WHERE item_id = $1', [_itemId]);
    await query("DELETE FROM members WHERE discord_id = 'ledger-test-member'");
    await query("DELETE FROM items WHERE name = 'test-item-ledger'");
  });

  it('balance = 0 sem movimentos', async () => {
    const b = await inventoryRepo.getStockForItem(_itemId);
    assert.equal(b, 0);
  });

  it('saldo_inicial soma', async () => {
    await query(
      `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
       VALUES ('saldo_inicial', $1, 100, $2, 'test')`,
      [_itemId, _memberId]
    );
    const b = await inventoryRepo.getStockForItem(_itemId);
    assert.equal(b, 100);
  });

  it('entrega_bairrista + fornecimento_org = balance correcto', async () => {
    await query(
      `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
       VALUES ('saldo_inicial', $1, 100, $2, 'test'), ('entrega_bairrista', $1, 50, $2, 'test'), ('fornecimento_org', $1, 30, $2, 'test')`,
      [_itemId, _memberId]
    );
    const b = await inventoryRepo.getStockForItem(_itemId);
    assert.equal(b, 120, '100 + 50 - 30 = 120');
  });

  it('ajuste_manual negativo desconta', async () => {
    await query(
      `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
       VALUES ('saldo_inicial', $1, 100, $2, 'test'), ('ajuste_manual', $1, -25, $2, 'test')`,
      [_itemId, _memberId]
    );
    const b = await inventoryRepo.getStockForItem(_itemId);
    assert.equal(b, 75);
  });

  it('perda_saida e consumo_saida descontam', async () => {
    await query(
      `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
       VALUES ('saldo_inicial', $1, 200, $2, 'test'), ('perda_saida', $1, 30, $2, 'test'), ('consumo_saida', $1, 20, $2, 'test')`,
      [_itemId, _memberId]
    );
    const b = await inventoryRepo.getStockForItem(_itemId);
    assert.equal(b, 150, '200 - 30 - 20 = 150');
  });

  it('devolucao_saida, apreendido, craftado somam', async () => {
    await query(
      `INSERT INTO inventory_movements (movement_type, item_id, quantity, member_id, created_by)
       VALUES ('devolucao_saida', $1, 10, $2, 'test'), ('apreendido', $1, 5, $2, 'test'), ('craftado', $1, 7, $2, 'test')`,
      [_itemId, _memberId]
    );
    const b = await inventoryRepo.getStockForItem(_itemId);
    assert.equal(b, 22);
  });
});
