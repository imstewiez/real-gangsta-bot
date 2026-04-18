'use strict';
/**
 * Whitelist de armas permitidas nos dropdowns de saída.
 *
 * Lê a lista ordenada de `config/saida-weapons.json`. Só estas armas
 * aparecem no dropdown — tanto para "Arma Própria" como "Pedir à Org".
 * Isto é uma regra RP (armas brancas não são usadas em saídas).
 *
 * A ordem do JSON é a ordem que aparece no dropdown. Para mudar a lista
 * ou reordenar, editar o JSON — não é preciso tocar em código.
 *
 * Comparação é case-insensitive + trim para tolerar pequenas variações
 * no catálogo (ex: "Pistola Tec" vs "pistola tec  ").
 */

const path = require('path');
const fs = require('fs');
const { warn } = require('../logger');

let _cached = null;

function _normalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function loadAllowedWeapons() {
  if (_cached) return _cached;
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', 'config', 'saida-weapons.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const allowed = Array.isArray(parsed.allowed) ? parsed.allowed : [];
    _cached = {
      ordered: allowed,
      orderIndex: new Map(allowed.map((name, i) => [_normalize(name), i])),
    };
  } catch (e) {
    warn(`[SAIDA-WEAPONS] Falha a ler config/saida-weapons.json: ${e.message}. A lista fica vazia.`);
    _cached = { ordered: [], orderIndex: new Map() };
  }
  return _cached;
}

/**
 * Filtra uma lista de items do catálogo para só deixar as armas permitidas
 * em saídas, ordenadas segundo o JSON. Não preserva o ordering original.
 *
 * @param {Array<{ id, name, category, ... }>} items
 * @returns {Array<{ id, name, category, ... }>} items filtrados e ordenados
 */
function filterAndOrderForSaida(items) {
  const { orderIndex } = loadAllowedWeapons();
  if (orderIndex.size === 0) return [];
  const result = [];
  for (const item of items || []) {
    const key = _normalize(item.name);
    if (orderIndex.has(key)) result.push(item);
  }
  result.sort((a, b) => {
    const ai = orderIndex.get(_normalize(a.name)) ?? 999;
    const bi = orderIndex.get(_normalize(b.name)) ?? 999;
    return ai - bi;
  });
  return result;
}

function isAllowed(name) {
  const { orderIndex } = loadAllowedWeapons();
  return orderIndex.has(_normalize(name));
}

// Apenas para testes — permite rehidratar entre testes.
function _resetCache() {
  _cached = null;
}

module.exports = { loadAllowedWeapons, filterAndOrderForSaida, isAllowed, _resetCache };
