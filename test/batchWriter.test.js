'use strict';
/**
 * Unit tests para BatchWriter — validação de limites de segurança.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BatchWriter } = require('../src/sheets/batchWriter');

describe('BatchWriter', () => {
  it('flush vazio devolve replies vazio', async () => {
    const bw = new BatchWriter(null, 'test-id');
    const r = await bw.flush();
    assert.deepStrictEqual(r, { replies: [] });
  });

  it('validate passa com requests dentro do limite', () => {
    const bw = new BatchWriter(null, 'test-id');
    for (let i = 0; i < 100; i++) {
      bw.setRowHeight(0, i, 20);
    }
    assert.strictEqual(bw.size(), 100);
    bw.validate(); // não deve lançar
  });

  it('validate atira se requests > 900', () => {
    const bw = new BatchWriter(null, 'test-id');
    for (let i = 0; i < 901; i++) {
      bw.setRowHeight(0, i, 20);
    }
    assert.throws(() => bw.validate(), /Limite de requests excedido/);
  });

  it('addChart acumula request', () => {
    const bw = new BatchWriter(null, 'test-id');
    bw.addChart({ spec: { title: 'Test' }, position: { overlayPosition: {} } });
    assert.strictEqual(bw.size(), 1);
  });

  it('clearRange + updateCells + mergeCells encadeiam', () => {
    const bw = new BatchWriter(null, 'test-id');
    bw.clearRange(123)
      .updateCells(123, 0, 0, [[{ userEnteredValue: { stringValue: 'A' } }]])
      .mergeCells(123, 0, 1, 0, 2);
    assert.strictEqual(bw.size(), 3);
  });
});
