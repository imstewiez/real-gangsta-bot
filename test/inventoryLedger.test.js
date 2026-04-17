'use strict';
/**
 * Testes do cálculo de ledger no inventário — valida que cada movement_type
 * tem o sinal correcto na agregação de stock.
 *
 * Não corre SQL real; constrói uma função pura que reflecte exactamente a
 * mesma lógica de sinais da query em src/repositories/inventory.js. Se a
 * query mudar, este teste tem de ser actualizado em conjunto.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Cópia textual da matriz de sinais — alinhada com getStock/getStockForItem.
const POSITIVE_TYPES = new Set([
  'saldo_inicial',
  'entrega_bairrista',
  'venda_bairrista',
  'entrega_oficial',
  'devolucao_saida',
  'apreendido',
  'craftado',
]);
const NEGATIVE_TYPES = new Set(['fornecimento_org', 'consumo_saida', 'perda_saida']);

function signedQuantity(movementType, quantity) {
  if (POSITIVE_TYPES.has(movementType)) return quantity;
  if (NEGATIVE_TYPES.has(movementType)) return -quantity;
  if (movementType === 'ajuste_manual') return quantity; // pode ser negativa
  return 0;
}

function computeBalance(movements) {
  return movements.reduce((sum, m) => sum + signedQuantity(m.type, m.qty), 0);
}

describe('inventoryLedger — sinais por movement_type', () => {
  it('saldo_inicial conta como positivo (regressão Fase 7)', () => {
    assert.equal(signedQuantity('saldo_inicial', 100), 100);
  });

  it('entregas e vendas adicionam stock', () => {
    assert.equal(signedQuantity('entrega_bairrista', 5), 5);
    assert.equal(signedQuantity('venda_bairrista', 5), 5);
    assert.equal(signedQuantity('entrega_oficial', 5), 5);
    assert.equal(signedQuantity('apreendido', 5), 5);
    assert.equal(signedQuantity('craftado', 5), 5);
  });

  it('fornecimentos/consumos/perdas removem stock', () => {
    assert.equal(signedQuantity('fornecimento_org', 5), -5);
    assert.equal(signedQuantity('consumo_saida', 5), -5);
    assert.equal(signedQuantity('perda_saida', 5), -5);
  });

  it('devolucao_saida traz stock de volta', () => {
    assert.equal(signedQuantity('devolucao_saida', 5), 5);
  });

  it('ajuste_manual usa o sinal recebido', () => {
    assert.equal(signedQuantity('ajuste_manual', 10), 10);
    assert.equal(signedQuantity('ajuste_manual', -10), -10);
  });

  it('movement_type desconhecido devolve 0 (rede de segurança)', () => {
    assert.equal(signedQuantity('xyz_unknown', 999), 0);
  });

  it('movement_types legacy (morador/operacao) já não são reconhecidos', () => {
    // Post-v2.3: os nomes legacy deixaram de ser válidos — ver migration 027.
    // A migration faz UPDATE dos dados antigos, portanto o ledger em prod só
    // tem os novos. Se aparecer um legacy em runtime é um bug — não deve
    // contribuir para o balance.
    assert.equal(signedQuantity('entrega_morador', 5), 0);
    assert.equal(signedQuantity('venda_morador', 5), 0);
    assert.equal(signedQuantity('consumo_operacao', 5), 0);
    assert.equal(signedQuantity('perda_operacao', 5), 0);
    assert.equal(signedQuantity('devolucao_operacao', 5), 0);
  });
});

describe('inventoryLedger — fluxo end-to-end', () => {
  it('bootstrap + entrega + fornecimento + devolução = balance correcto', () => {
    const movs = [
      { type: 'saldo_inicial', qty: 100 }, // +100
      { type: 'entrega_bairrista', qty: 50 }, // +50  → 150
      { type: 'fornecimento_org', qty: 30 }, // -30  → 120
      { type: 'devolucao_saida', qty: 20 }, // +20  → 140
      { type: 'perda_saida', qty: 5 }, //  -5  → 135
    ];
    assert.equal(computeBalance(movs), 135);
  });

  it('só com saldo_inicial', () => {
    assert.equal(computeBalance([{ type: 'saldo_inicial', qty: 250 }]), 250);
  });

  it('ajustes negativos descontam', () => {
    const movs = [
      { type: 'saldo_inicial', qty: 100 },
      { type: 'ajuste_manual', qty: -25 },
    ];
    assert.equal(computeBalance(movs), 75);
  });
});
