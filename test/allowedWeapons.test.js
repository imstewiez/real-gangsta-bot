'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { loadAllowedWeapons, filterAndOrderForSaida, isAllowed, _resetCache } = require('../src/saidas/allowedWeapons');

describe('allowedWeapons', () => {
  beforeEach(() => _resetCache());

  it('loadAllowedWeapons reads a non-empty source-of-truth list', () => {
    const { ordered, orderIndex } = loadAllowedWeapons();
    assert.ok(Array.isArray(ordered));
    assert.ok(ordered.length > 0, 'allowed weapons list should not be empty');
    assert.equal(orderIndex.size, ordered.length);
  });

  it('isAllowed is case-insensitive and trims spaces', () => {
    assert.equal(isAllowed('Micro SMG'), true);
    assert.equal(isAllowed('micro smg'), true);
    assert.equal(isAllowed('  MICRO SMG  '), true);
    assert.equal(isAllowed('AK-47'), false);
    assert.equal(isAllowed(''), false);
    assert.equal(isAllowed(null), false);
  });

  it('denies melee and generic weapons', () => {
    assert.equal(isAllowed('Faca'), false);
    assert.equal(isAllowed('Porrete'), false);
    assert.equal(isAllowed('Taco de Basebol'), false);
    assert.equal(isAllowed('Pistola'), false, 'generic Pistol is not allowed');
    assert.equal(isAllowed('Machete'), false);
  });

  it('allows the current Ballas output weapon list', () => {
    const expected = [
      'Mini SMG',
      'Pistol XM3',
      'Micro SMG',
      'TEC-9',
      'TEC Pistol',
      'AP Pistol',
      'Heavy Pistol',
      'Pistola .50',
      'P90',
      'Combat PDW',
      'Bullpup Rifle',
      'Carabina Rifle',
    ];

    for (const name of expected) {
      assert.equal(isAllowed(name), true, `"${name}" should be allowed`);
    }
  });

  it('filterAndOrderForSaida returns only allowed items in JSON order', () => {
    const items = [
      { id: 1, name: 'Faca', category: 'armas_brancas' },
      { id: 2, name: 'P90', category: 'armas_fogo' },
      { id: 3, name: 'Porrete', category: 'armas_brancas' },
      { id: 4, name: 'Micro SMG', category: 'armas_fogo' },
      { id: 5, name: 'AK-47', category: 'armas_fogo' },
      { id: 6, name: 'TEC Pistol', category: 'armas_fogo' },
    ];

    const result = filterAndOrderForSaida(items);

    assert.deepEqual(
      result.map(w => w.name),
      ['Micro SMG', 'TEC Pistol', 'P90']
    );
  });

  it('filterAndOrderForSaida returns [] for empty input', () => {
    assert.deepEqual(filterAndOrderForSaida([]), []);
    assert.deepEqual(filterAndOrderForSaida(null), []);
  });

  it('filterAndOrderForSaida preserves item fields', () => {
    const items = [{ id: 42, name: 'P90', category: 'armas_fogo', estimated_value: 5000, unit: 'unidade' }];
    const result = filterAndOrderForSaida(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 42);
    assert.equal(result[0].estimated_value, 5000);
  });

  it('matches catalog items case-insensitively', () => {
    const items = [
      { id: 1, name: 'micro smg', category: 'armas_fogo' },
      { id: 2, name: 'PISTOLA .50', category: 'armas_fogo' },
    ];
    const result = filterAndOrderForSaida(items);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'micro smg');
    assert.equal(result[1].name, 'PISTOLA .50');
  });
});
