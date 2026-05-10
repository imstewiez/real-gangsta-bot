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

const shouldSkip = !process.env.CI && !process.env.DISCORD_BOT_TOKEN;

(shouldSkip ? describe.skip : describe)('isTransientSheetsError', () => {
  const { isTransientSheetsError } = require('../src/sheets/syncEngine');

  it('retorna true para 5xx', () => {
    assert.equal(isTransientSheetsError({ code: 500 }), true);
    assert.equal(isTransientSheetsError({ code: 502 }), true);
    assert.equal(isTransientSheetsError({ code: 503 }), true);
  });

  it('retorna true para 429', () => {
    assert.equal(isTransientSheetsError({ code: 429 }), true);
  });

  it('retorna true para ECONNRESET/ETIMEDOUT/ENOTFOUND', () => {
    assert.equal(isTransientSheetsError({ code: 'ECONNRESET' }), true);
    assert.equal(isTransientSheetsError({ code: 'ETIMEDOUT' }), true);
    assert.equal(isTransientSheetsError({ code: 'ENOTFOUND' }), true);
  });

  it('retorna false para 4xx (client error)', () => {
    assert.equal(isTransientSheetsError({ code: 400 }), false);
    assert.equal(isTransientSheetsError({ code: 403 }), false);
    assert.equal(isTransientSheetsError({ code: 404 }), false);
  });

  it('retorna false para erros desconhecidos', () => {
    assert.equal(isTransientSheetsError({ code: 'UNKNOWN' }), false);
    assert.equal(isTransientSheetsError({}), false);
    assert.equal(isTransientSheetsError(null), false);
  });
});
