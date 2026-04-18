'use strict';
/**
 * Testa o loader + filter da whitelist de armas de saída.
 * O JSON é source-of-truth; o teste verifica comportamento contra a lista
 * actual.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { loadAllowedWeapons, filterAndOrderForSaida, isAllowed, _resetCache } = require('../src/saidas/allowedWeapons');

describe('allowedWeapons', () => {
  beforeEach(() => _resetCache());

  it('loadAllowedWeapons lê JSON com lista não-vazia', () => {
    const { ordered, orderIndex } = loadAllowedWeapons();
    assert.ok(Array.isArray(ordered));
    assert.ok(ordered.length > 0, 'lista não deve estar vazia');
    assert.equal(orderIndex.size, ordered.length);
  });

  it('isAllowed case-insensitive e tolerante a espaços', () => {
    assert.equal(isAllowed('Micro SMG'), true);
    assert.equal(isAllowed('micro smg'), true);
    assert.equal(isAllowed('  MICRO SMG  '), true);
    assert.equal(isAllowed('AK-47'), false);
    assert.equal(isAllowed(''), false);
    assert.equal(isAllowed(null), false);
  });

  it('armas brancas e outras não permitidas ficam FORA', () => {
    assert.equal(isAllowed('Faca'), false);
    assert.equal(isAllowed('Porrete'), false);
    assert.equal(isAllowed('Taco de Basebol'), false);
    assert.equal(isAllowed('Pistola'), false, 'Pistola genérica não está na lista');
    assert.equal(isAllowed('Machete'), false);
  });

  it('todas as 10 armas-chave estão permitidas', () => {
    const must = [
      'Micro SMG',
      'Machine Pistol',
      'Pistola Tec',
      'Espingarda de Assalto',
      'AP Pistola',
      'Compact Rifle',
      'Gusenberg',
      'P90',
      'Carabina Especial',
      'Pistola .50',
    ];
    for (const name of must) {
      assert.equal(isAllowed(name), true, `"${name}" deve estar permitida`);
    }
  });

  it('filterAndOrderForSaida devolve só items permitidos, na ordem do JSON', () => {
    const items = [
      { id: 1, name: 'Faca', category: 'armas_brancas' },
      { id: 2, name: 'Gusenberg', category: 'armas_fogo' },
      { id: 3, name: 'Porrete', category: 'armas_brancas' },
      { id: 4, name: 'Micro SMG', category: 'armas_fogo' },
      { id: 5, name: 'AK-47', category: 'armas_fogo' },
      { id: 6, name: 'Machine Pistol', category: 'armas_fogo' },
    ];
    const result = filterAndOrderForSaida(items);
    // Faca, Porrete, AK-47 devem sair. Ordem = Micro SMG, Machine Pistol, Gusenberg.
    assert.deepEqual(
      result.map(w => w.name),
      ['Micro SMG', 'Machine Pistol', 'Gusenberg']
    );
  });

  it('filterAndOrderForSaida com items vazio → []', () => {
    assert.deepEqual(filterAndOrderForSaida([]), []);
    assert.deepEqual(filterAndOrderForSaida(null), []);
  });

  it('filterAndOrderForSaida preserva os outros campos do item', () => {
    const items = [{ id: 42, name: 'P90', category: 'armas_fogo', estimated_value: 5000, unit: 'unidade' }];
    const result = filterAndOrderForSaida(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 42);
    assert.equal(result[0].estimated_value, 5000);
  });

  it('matching é case-insensitive (catálogo pode ter capitalização inconsistente)', () => {
    const items = [
      { id: 1, name: 'micro smg', category: 'armas_fogo' },
      { id: 2, name: 'PISTOLA .50', category: 'armas_fogo' },
    ];
    const result = filterAndOrderForSaida(items);
    assert.equal(result.length, 2);
    // A ordem não quebra com capitalização diferente.
    assert.equal(result[0].name, 'micro smg'); // Micro SMG vem antes de Pistola .50
    assert.equal(result[1].name, 'PISTOLA .50');
  });
});
