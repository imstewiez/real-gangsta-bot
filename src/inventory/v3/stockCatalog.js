'use strict';
/**
 * Catálogo fixo de 10 artigos do Stock v3.
 * Todos os preços de custo são lidos de stock_v3_pricing.
 */

const { getPricing } = require('./stockPricing');

const CATALOG = Object.freeze([
  { key: 'droga', name: 'Droga' },
  { key: 'dinheiro', name: 'Dinheiro' },
  { key: 'armas', name: 'Armas' },
  { key: 'carregadores', name: 'Carregadores' },
  { key: 'acessorios', name: 'Acessórios de Armas' },
  { key: 'coletes', name: 'Coletes' },
  { key: 'prints', name: 'Prints' },
  { key: 'corpos', name: 'Corpos de Armas' },
  { key: 'cobre', name: 'Cobre' },
  { key: 'polvora', name: 'Polvora' },
]);

const CATALOG_BY_KEY = new Map(CATALOG.map(i => [i.key, i]));

function getCatalog() {
  return [...CATALOG];
}

function getItem(key) {
  return CATALOG_BY_KEY.get(key) || null;
}

function getItemName(key) {
  return CATALOG_BY_KEY.get(key)?.name || key;
}

async function getUnitCost(itemKey) {
  const pricing = await getPricing(itemKey);
  return pricing ? Number(pricing.unit_cost) : 0;
}

async function getTotalCost(itemKey, quantity) {
  const unit = await getUnitCost(itemKey);
  return unit * quantity;
}

module.exports = {
  getCatalog,
  getItem,
  getItemName,
  getUnitCost,
  getTotalCost,
};
