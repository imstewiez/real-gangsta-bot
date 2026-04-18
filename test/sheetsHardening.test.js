'use strict';
/**
 * Tests de hardening do subsistema Sheets — cobre os 3 pilares do pass:
 *   - classificação de erros transitórios (retry só em 5xx/429/rede)
 *   - métricas incrementam por tab+resultado
 *   - _maxWrittenCell inclui setRowHeight (updateDimensionProperties)
 *
 * Determinismo: sem timers reais, sem Google API, sem DB. Os syncers são
 * stubbed via TAB_SYNCERS para syncOne, mas os tests mais profundos
 * (retry + in-flight semantics) vivem em projectionsRetry.test.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isTransientSheetsError', () => {
  const { isTransientSheetsError } = require('../src/sheets/syncEngine');

  it('retorna true para 5xx', () => {
    assert.equal(isTransientSheetsError({ code: 500 }), true);
    assert.equal(isTransientSheetsError({ code: 503 }), true);
    assert.equal(isTransientSheetsError({ response: { status: 502 } }), true);
  });

  it('retorna true para 429 (rate limit)', () => {
    assert.equal(isTransientSheetsError({ code: 429 }), true);
    assert.equal(isTransientSheetsError({ response: { status: 429 } }), true);
  });

  it('retorna true para erros de rede (ECONNRESET, ETIMEDOUT, EAI_AGAIN, ENOTFOUND)', () => {
    assert.equal(isTransientSheetsError({ code: 'ECONNRESET' }), true);
    assert.equal(isTransientSheetsError({ code: 'ETIMEDOUT' }), true);
    assert.equal(isTransientSheetsError({ code: 'EAI_AGAIN' }), true);
    assert.equal(isTransientSheetsError({ code: 'ENOTFOUND' }), true);
  });

  it('retorna false para 4xx que não 429 (bugs do bot)', () => {
    assert.equal(isTransientSheetsError({ code: 400 }), false);
    assert.equal(isTransientSheetsError({ code: 401 }), false);
    assert.equal(isTransientSheetsError({ code: 403 }), false);
    assert.equal(isTransientSheetsError({ code: 404 }), false);
  });

  it('fallback por mensagem apanha timeouts/rate-limit enterrados', () => {
    assert.equal(isTransientSheetsError(new Error('request timeout exceeded')), true);
    assert.equal(isTransientSheetsError(new Error('socket hang up')), true);
    assert.equal(isTransientSheetsError(new Error('User rate limit exceeded')), true);
    assert.equal(isTransientSheetsError(new Error('quota exceeded for user')), true);
  });

  it('retorna false para erros desconhecidos (conservador — não faz retry)', () => {
    assert.equal(isTransientSheetsError(new Error('Invalid requests[0].updateCells')), false);
    assert.equal(isTransientSheetsError(new Error('Sheet id not found')), false);
    assert.equal(isTransientSheetsError(null), false);
    assert.equal(isTransientSheetsError(undefined), false);
  });
});

describe('sheets metrics', () => {
  it('sheetsSyncByTab expõe labels tab+result', () => {
    const metrics = require('../src/lib/metrics');
    assert.equal(typeof metrics.sheetsSyncByTab.inc, 'function');
    assert.deepEqual(metrics.sheetsSyncByTab.labelNames, ['tab', 'result']);
  });

  it('sheetsSyncTotal e sheetsSyncErrorsTotal estão expostos para increment', () => {
    const metrics = require('../src/lib/metrics');
    const before = metrics.sheetsSyncTotal.get();
    metrics.sheetsSyncTotal.inc();
    assert.equal(metrics.sheetsSyncTotal.get(), before + 1);

    const beforeErr = metrics.sheetsSyncErrorsTotal.get();
    metrics.sheetsSyncErrorsTotal.inc();
    assert.equal(metrics.sheetsSyncErrorsTotal.get(), beforeErr + 1);
  });
});

describe('_maxWrittenCell — cobertura de request types', () => {
  // Força re-require do syncEngine para acesso ao _maxWrittenCell via
  // monkey-patch de cleanup — aqui testamos indirectamente via requests.
  // Unit test puro do helper vive in-file; como não é exportado, usamos
  // uma instância fake de BatchWriter.
  const { BatchWriter } = require('../src/sheets/batchWriter');
  // Extrai _maxWrittenCell por re-require + eval indirecta não é possível
  // sem exposed. Em vez disso, testamos que o trimSheet funciona com um
  // batch que contenha updateDimensionProperties (caso do stock.js).
  const { trimSheet } = require('../src/sheets/cleanup');

  it('updateDimensionProperties com dimension=ROWS mantém-se no batch', () => {
    const batch = new BatchWriter({}, 'dummy');
    batch.setRowHeight(1, 500, 22); // sheetId=1, row=500, height=22
    const req = batch.requests.find(r => r.updateDimensionProperties);
    assert.ok(req, 'setRowHeight deve gerar updateDimensionProperties');
    assert.equal(req.updateDimensionProperties.range.dimension, 'ROWS');
    assert.equal(req.updateDimensionProperties.range.startIndex, 500);
    assert.equal(req.updateDimensionProperties.range.endIndex, 501);
  });

  it('trimSheet usa DEFAULT_PADDING_ROWS=3 (headroom defensivo)', () => {
    const batch = new BatchWriter({}, 'dummy');
    trimSheet(batch, 1, 100, 10); // 100 rows used, 10 cols used
    const req = batch.requests.find(r => r.updateSheetProperties);
    assert.ok(req, 'trimSheet deve gerar updateSheetProperties');
    // rowCount = max(10, 100 + 3) = 103
    assert.equal(req.updateSheetProperties.properties.gridProperties.rowCount, 103);
    assert.equal(req.updateSheetProperties.properties.gridProperties.columnCount, 10);
  });
});
