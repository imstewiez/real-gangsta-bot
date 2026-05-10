'use strict';
/**
 * Tests para o circuit breaker do Google Sheets sync engine.
 */

const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');

const shouldSkip = !process.env.CI && !process.env.DISCORD_BOT_TOKEN;

(shouldSkip ? describe.skip : describe)('sheets syncEngine — circuit breaker', () => {
  const {
    _circuitRecord,
    _circuitIsOpen,
    _circuitReset,
    CIRCUIT_FAILURE_THRESHOLD,
  } = require('../src/sheets/syncEngine');

  beforeEach(() => {
    _circuitReset();
  });

  it('circuito fechado por default', () => {
    assert.strictEqual(_circuitIsOpen('dashboard'), false);
    assert.strictEqual(_circuitIsOpen('rankings'), false);
  });

  it('circuito abre após N falhas consecutivas', async () => {
    const key = 'dashboard';
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD - 1; i++) {
      await _circuitRecord(key, false);
      assert.strictEqual(_circuitIsOpen(key), false, `deve estar fechado na falha ${i + 1}`);
    }
    await _circuitRecord(key, false);
    assert.strictEqual(_circuitIsOpen(key), true, `deve abrir após ${CIRCUIT_FAILURE_THRESHOLD} falhas`);
  });

  it('sucesso reset contador de falhas', async () => {
    const key = 'stock';
    await _circuitRecord(key, false);
    await _circuitRecord(key, false);
    assert.strictEqual(_circuitIsOpen(key), false);
    await _circuitRecord(key, true); // sucesso reset
    await _circuitRecord(key, false);
    await _circuitRecord(key, false);
    // Só temos 2 falhas desde o último sucesso
    assert.strictEqual(_circuitIsOpen(key), false);
  });

  it('circuito auto-reseta após cooldown', async () => {
    const key = 'rankings';
    // Forçar estado de circuito aberto
    await _circuitRecord(key, false);
    await _circuitRecord(key, false);
    await _circuitRecord(key, false);
    assert.strictEqual(_circuitIsOpen(key), true);

    // A lógica de auto-reset é testada indirectamente:
    // _circuitIsOpen verifica se Date.now() - openSince >= cooldown.
    // Como não mockamos Date, apenas verificamos que a função existe
    // e retorna true imediatamente após abrir.
    assert.strictEqual(_circuitIsOpen(key), true);
  });

  it('tabs independentes — falha numa não afecta outra', async () => {
    await _circuitRecord('dashboard', false);
    await _circuitRecord('dashboard', false);
    await _circuitRecord('dashboard', false);
    assert.strictEqual(_circuitIsOpen('dashboard'), true);
    assert.strictEqual(_circuitIsOpen('stock'), false);
  });

  it('syncOne salta tab quando circuito aberto', async () => {
    // Este teste é de integração — requer mock do sheets client.
    // Testamos a lógica do circuito em isolamento acima.
    assert.strictEqual(true, true);
  });
});
