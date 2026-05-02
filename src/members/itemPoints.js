'use strict';
/**
 * Sistema de pontos por item entregue — usado para promoções de tier.
 *
 * Regras (pedido pelo user):
 *   4 pts — Moldes, Corpos, Prints
 *   3 pts — Plástico velho/reciclado, Lixo eletronico, Cobre, Polvora, Peças
 *   2 pts — Sucata, Ferro, Telem Estragados, Rádios Estragados, Carvão, Borracha
 *   1 pt  — Restantes materiais
 *   0 pts — Itens de mercado/droga (categoria quimicos_droga, dinheiro)
 */

const ITEM_POINTS_BY_NAME = new Map([
  // 4 pontos
  ['molde de arma', 4],
  ['carroçaria', 4],

  // 3 pontos
  ['plástico velho', 3],
  ['plastico velho', 3],
  ['plástico reciclado', 3],
  ['plastico reciclado', 3],
  ['lixo eletrónico', 3],
  ['lixo eletronico', 3],
  ['barra de cobre', 3],
  ['pepita de cobre', 3],
  ['pólvora', 3],
  ['polvora', 3],
  ['peças', 3],
  ['pecas', 3],

  // 2 pontos
  ['sucata', 2],
  ['sucata enferrujada', 2],
  ['barra de ferro', 2],
  ['telemóvel estragado', 2],
  ['telemovel estragado', 2],
  ['rádio estragado', 2],
  ['radio estragado', 2],
  ['carvão', 2],
  ['carvao', 2],
  ['minério de carvão', 2],
  ['minero de carvao', 2],
  ['borracha', 2],
]);

const ZERO_POINT_CATEGORIES = new Set(['quimicos_droga', 'dinheiro']);

/**
 * Retorna os pontos para um item dado o nome e a categoria.
 * @param {string} itemName
 * @param {string} category
 * @returns {number}
 */
function pointsForItem(itemName, category) {
  if (category && ZERO_POINT_CATEGORIES.has(category.toLowerCase())) {
    return 0;
  }
  const normalized = (itemName || '').toLowerCase().trim();
  return ITEM_POINTS_BY_NAME.get(normalized) || 1; // default = 1 ponto
}

/**
 * Constrói um fragmento SQL CASE que mapeia nomes de itens para pontos.
 * Usado nas queries de agregação para calcular pontos directamente na DB.
 * @returns {string}
 */
function buildItemPointsCase() {
  const cases = [];
  for (const [name, pts] of ITEM_POINTS_BY_NAME) {
    cases.push(`WHEN LOWER(i.name) = '${name.replace(/'/g, "''")}' THEN ${pts}`);
  }
  // Categorias 0 pts
  const zeroCats = [...ZERO_POINT_CATEGORIES].map(c => `'${c}'`).join(',');
  return `
    CASE
      WHEN i.category IN (${zeroCats}) THEN 0
      ${cases.join('\n      ')}
      ELSE 1
    END
  `;
}

module.exports = {
  pointsForItem,
  buildItemPointsCase,
  ITEM_POINTS_BY_NAME,
  ZERO_POINT_CATEGORIES,
};
