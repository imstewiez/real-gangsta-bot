'use strict';
/**
 * Unit tests da lógica pura do itemSearch:
 *   - normalize (acentos, caso, espaços)
 *   - rankItems (exact > prefix > word-prefix > substring)
 *   - empty query, no matches, broad query
 *   - empate desempata por length ascending
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// Stub mínimo do DB — itemSearch importa inventoryRepo pelo path do engine
require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

const { normalize, rankItems } = require('../src/inventory/itemSearch');

// ═══════════════════════════════════════════════════════════════════════════
// normalize
// ═══════════════════════════════════════════════════════════════════════════

describe('itemSearch.normalize', () => {
  it('lowercase', () => {
    assert.equal(normalize('AP PISTOL'), 'ap pistol');
  });

  it('desacentua', () => {
    assert.equal(normalize('Ópio'), 'opio');
    assert.equal(normalize('Pólvora'), 'polvora');
    assert.equal(normalize('Tábua Ébano'), 'tabua ebano');
  });

  it('colapsa whitespace e trimma', () => {
    assert.equal(normalize('  AP   Pistol  '), 'ap pistol');
  });

  it('null/undefined → empty string', () => {
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
  });

  it('ç → c', () => {
    assert.equal(normalize('Cabeços'), 'cabecos');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// rankItems — scoring + ordering
// ═══════════════════════════════════════════════════════════════════════════

const ITEMS = [
  { id: 1, name: 'AP Pistol', category: 'armas_orange', estimated_value: 115000 },
  { id: 2, name: 'AP Pistola', category: 'armas_orange', estimated_value: 115000 },
  { id: 3, name: 'Carregador Especial', category: 'carregadores', estimated_value: 3500 },
  { id: 4, name: 'Carregador Red', category: 'carregadores', estimated_value: 3000 },
  { id: 5, name: 'Mag Expandido', category: 'acessorios', estimated_value: 5000 },
  { id: 6, name: 'TEC 9', category: 'armas_orange', estimated_value: 90000 },
  { id: 7, name: 'TEC Pistol', category: 'armas_orange', estimated_value: 110000 },
  { id: 8, name: 'Ópio 100u', category: 'drogas', estimated_value: 40000 },
  { id: 9, name: 'Pólvora', category: 'metais_especiais', estimated_value: 100 },
  { id: 10, name: 'Mira', category: 'acessorios', estimated_value: 1500 },
];

describe('itemSearch.rankItems — scoring', () => {
  it('empty query → empty array', () => {
    assert.deepEqual(rankItems('', ITEMS), []);
    assert.deepEqual(rankItems('   ', ITEMS), []);
    assert.deepEqual(rankItems(null, ITEMS), []);
  });

  it('query sem match → empty', () => {
    assert.deepEqual(rankItems('xyznotfound', ITEMS), []);
  });

  it('exact match vence prefixo', () => {
    const r = rankItems('mira', ITEMS);
    assert.equal(r[0].name, 'Mira');
  });

  it('prefix match "ap" devolve ambos os AP', () => {
    const r = rankItems('ap', ITEMS).map(i => i.name);
    assert.ok(r.includes('AP Pistol'));
    assert.ok(r.includes('AP Pistola'));
    // "AP Pistol" (9 chars) vem antes de "AP Pistola" (10 chars)
    assert.equal(r[0], 'AP Pistol');
  });

  it('prefix "tec" devolve TEC 9 e TEC Pistol, ordenados por length', () => {
    const r = rankItems('tec', ITEMS).map(i => i.name);
    assert.deepEqual(r, ['TEC 9', 'TEC Pistol']);
  });

  it('prefix "carregador" devolve os 2 carregadores', () => {
    const r = rankItems('carregador', ITEMS).map(i => i.name);
    assert.equal(r.length, 2);
    assert.ok(r.includes('Carregador Especial'));
    assert.ok(r.includes('Carregador Red'));
  });

  it('accent-insensitive: "opio" apanha "Ópio 100u"', () => {
    const r = rankItems('opio', ITEMS).map(i => i.name);
    assert.equal(r[0], 'Ópio 100u');
  });

  it('accent-insensitive: "polvora" apanha "Pólvora"', () => {
    const r = rankItems('polvora', ITEMS).map(i => i.name);
    assert.equal(r[0], 'Pólvora');
  });

  it('word-prefix: "pistol" apanha items cuja 2ª palavra começa com pistol', () => {
    const r = rankItems('pistol', ITEMS).map(i => i.name);
    assert.ok(r.includes('AP Pistol'));
    assert.ok(r.includes('TEC Pistol'));
    // "AP Pistola" não tem palavra que COMEÇA com "pistol" exactamente? sim:
    // "pistola" começa com "pistol" — deve apanhar
    assert.ok(r.includes('AP Pistola'));
  });

  it('substring fallback: "expand" apanha "Mag Expandido"', () => {
    const r = rankItems('expand', ITEMS).map(i => i.name);
    assert.ok(r.includes('Mag Expandido'));
  });

  it('case-insensitive', () => {
    const upper = rankItems('CARREGADOR', ITEMS);
    const lower = rankItems('carregador', ITEMS);
    assert.deepEqual(
      upper.map(i => i.id),
      lower.map(i => i.id)
    );
  });

  it('limit aplica-se ao top', () => {
    const many = [];
    for (let i = 0; i < 50; i++) many.push({ id: i, name: `Carregador ${i}`, category: 'x', estimated_value: 100 });
    const r = rankItems('carregador', many, { limit: 10 });
    assert.equal(r.length, 10);
  });

  it('ranking: exact > startsWith > word-startsWith > substring', () => {
    const items = [
      { id: 1, name: 'Outro ap qualquer', category: 'x', estimated_value: 0 }, // substring
      { id: 2, name: 'APocalipse', category: 'x', estimated_value: 0 }, // startsWith
      { id: 3, name: 'AP', category: 'x', estimated_value: 0 }, // exact
      { id: 4, name: 'Mega AP mais', category: 'x', estimated_value: 0 }, // word-startsWith
    ];
    const r = rankItems('ap', items).map(i => i.id);
    assert.deepEqual(r, [3, 2, 4, 1], 'exact > startsWith > word-startsWith > substring');
  });
});

describe('itemSearch.rankItems — broad query handling', () => {
  it('resultado grande é cortado pelo limit (default 20)', () => {
    const many = [];
    for (let i = 0; i < 100; i++) many.push({ id: i, name: `Item ${i}`, category: 'x', estimated_value: 0 });
    const r = rankItems('item', many);
    assert.equal(r.length, 20);
  });

  it('query de 1 char ainda devolve resultados — hint de "too broad" é UX-only', () => {
    const r = rankItems('a', ITEMS);
    // não rejeita queries curtas no core; a UI é que decide mostrar hint
    assert.ok(r.length > 0);
  });
});
