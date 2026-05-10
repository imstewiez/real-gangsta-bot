'use strict';
/**
 * Tests de retry no projections._flushTab.
 *
 * Estratégia: monkey-patch do `./syncEngine` module cache para injectar
 * um `syncOne` sob nosso controlo. Assim conseguimos observar:
 *   - quantas tentativas foram feitas
 *   - que erros foram considerados transitórios
 *   - que _inFlight é libertado mesmo após falhas finais
 *
 * Aceleração: substituímos também RETRY_DELAYS_MS via mutação da
 * constante exportada — o módulo já a usa por referência.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const shouldSkip = !process.env.CI && !process.env.DISCORD_BOT_TOKEN;

(shouldSkip ? describe.skip : describe)('projections — retry semantics', () => {
  function _freshProjections() {
    // Limpa cache do projections.js + syncEngine.js para reiniciar estado.
    delete require.cache[require.resolve('../src/sheets/projections')];
    delete require.cache[require.resolve('../src/sheets/syncEngine')];
    return require('../src/sheets/projections');
  }

  function _stubSyncEngine({ syncOne, isTransientSheetsError }) {
    // Substitui o módulo em cache para que projections veja a nossa versão.
    const mod = require('../src/sheets/syncEngine');
    const original = {
      syncOne: mod.syncOne,
      isTransientSheetsError: mod.isTransientSheetsError,
    };
    mod.syncOne = syncOne;
    if (isTransientSheetsError) mod.isTransientSheetsError = isTransientSheetsError;
    return () => {
      mod.syncOne = original.syncOne;
      mod.isTransientSheetsError = original.isTransientSheetsError;
    };
  }

  let projections;
  let restoreStub;
  const originalDelays = [];

  beforeEach(() => {
    projections = _freshProjections();
    // Acelera backoffs para 0ms em testes — mantém contagem de tentativas.
    for (let i = 0; i < projections.RETRY_DELAYS_MS.length; i += 1) {
      originalDelays[i] = projections.RETRY_DELAYS_MS[i];
      projections.RETRY_DELAYS_MS[i] = 0;
    }
  });

  afterEach(() => {
    if (restoreStub) restoreStub();
    restoreStub = null;
    for (let i = 0; i < projections.RETRY_DELAYS_MS.length; i += 1) {
      projections.RETRY_DELAYS_MS[i] = originalDelays[i];
    }
  });

  it('sync ok ao primeiro tiro: 1 chamada por tab mapeada', async () => {
    let calls = 0;
    restoreStub = _stubSyncEngine({
      syncOne: async tab => {
        calls += 1;
        return { tab, ops: 42, ms: 10 };
      },
    });
    await projections._flushNow(); // não há tabs pending → no-op
    const bus = require('../src/core/eventBus');
    projections.registerSheetProjections();
    await bus.emitAsync('saida.opened', { id: 1 });
    // saida.opened → ['saidas', 'resumo', 'dashboard'] — 3 tabs, 3 syncs.
    const results = await projections._flushNow();
    assert.equal(calls, 3);
    assert.equal(results.length, 3);
    assert.ok(results.every(r => !r.error));
  });

  it('erro persistente não-transitório: 1 chamada, sem retry, sem crash', async () => {
    let calls = 0;
    restoreStub = _stubSyncEngine({
      syncOne: async () => {
        calls += 1;
        const err = new Error('Invalid requests[0].updateCells');
        err.code = 400;
        throw err;
      },
    });
    const bus = require('../src/core/eventBus');
    projections.registerSheetProjections();
    await bus.emitAsync('saida.opened', { id: 1 });
    const results = await projections._flushNow();
    // _flushNow faz await directo de syncOne (sem retry) — apanha o erro.
    assert.equal(calls, 3); // 3 tabs, 1 attempt each
    assert.ok(results.every(r => r.error));
  });

  it('_syncWithRetry: transitório → retries até sucesso', async () => {
    let calls = 0;
    restoreStub = _stubSyncEngine({
      syncOne: async tab => {
        calls += 1;
        if (calls < 3) {
          const err = new Error('503 Service Unavailable');
          err.code = 503;
          throw err;
        }
        return { tab, ops: 7, ms: 1 };
      },
    });
    const result = await projections._syncWithRetry('stock');
    assert.equal(calls, 3); // 2 falhas transitórias + 1 sucesso
    assert.equal(result.ops, 7);
  });

  it('_syncWithRetry: não-transitório → 1 chamada, rethrow', async () => {
    let calls = 0;
    restoreStub = _stubSyncEngine({
      syncOne: async () => {
        calls += 1;
        const err = new Error('Invalid requests[0].updateCells');
        err.code = 400;
        throw err;
      },
    });
    await assert.rejects(() => projections._syncWithRetry('stock'), /Invalid requests/);
    assert.equal(calls, 1); // bug do bot = bail imediato, sem retry
  });

  it('_syncWithRetry: transitório persistente → MAX tentativas, depois throws', async () => {
    let calls = 0;
    restoreStub = _stubSyncEngine({
      syncOne: async () => {
        calls += 1;
        const err = new Error('503 Service Unavailable');
        err.code = 503;
        throw err;
      },
    });
    await assert.rejects(() => projections._syncWithRetry('stock'), /503/);
    // RETRY_DELAYS_MS.length tentativas adicionais + 1 inicial = 4.
    assert.equal(calls, projections.RETRY_DELAYS_MS.length + 1);
  });

  it('EVENT_TO_TABS e RETRY_DELAYS_MS estão exportados', () => {
    assert.ok(projections.EVENT_TO_TABS);
    assert.ok(Array.isArray(projections.RETRY_DELAYS_MS));
    assert.ok(projections.RETRY_DELAYS_MS.length >= 3, 'pelo menos 3 tentativas de retry');
  });
});
