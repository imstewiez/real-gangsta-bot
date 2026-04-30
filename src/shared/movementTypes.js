'use strict';
/**
 * Movement types canonizados para todo o projeto.
 *
 * Centralizar aqui evita drift quando novos tipos são adicionados
 * ou quando queries precisam de saber quais movimentos "contam".
 */

const MOVEMENT_TYPE = Object.freeze({
  // Entregas (positivo para stock)
  ENTREGA_BAIRRISTA: 'entrega_bairrista',
  ENTREGA_OFICIAL: 'entrega_oficial',

  // Vendas (positivo para stock, valor monetário)
  VENDA_BAIRRISTA: 'venda_bairrista',

  // Fornecimento / consumo (negativo para stock)
  FORNECIMENTO_ORG: 'fornecimento_org',
  CONSUMO_SAIDA: 'consumo_saida',
  PERDA_SAIDA: 'perda_saida',

  // Devoluções / ajustes (positivo ou negativo)
  DEVOLUCAO_SAIDA: 'devolucao_saida',
  AJUSTE_MANUAL: 'ajuste_manual',

  // Outros (positivo para stock)
  SALDO_INICIAL: 'saldo_inicial',
  APREENDIDO: 'apreendido',
  CRAFTADO: 'craftado',

  // Legacy (read-only, não devem ser criados novos)
  ENTREGA_MORADOR: 'entrega_morador',
  VENDA_MORADOR: 'venda_morador',
  CONSUMO_OPERACAO: 'consumo_operacao',
  DEVOLUCAO_OPERACAO: 'devolucao_operacao',
  PERDA_OPERACAO: 'perda_operacao',
});

// Movimentos que aumentam stock (receitas)
const STOCK_INFLOW_TYPES = Object.freeze([
  MOVEMENT_TYPE.ENTREGA_BAIRRISTA,
  MOVEMENT_TYPE.ENTREGA_OFICIAL,
  MOVEMENT_TYPE.VENDA_BAIRRISTA,
  MOVEMENT_TYPE.DEVOLUCAO_SAIDA,
  MOVEMENT_TYPE.SALDO_INICIAL,
  MOVEMENT_TYPE.APREENDIDO,
  MOVEMENT_TYPE.CRAFTADO,
]);

// Movimentos que diminuem stock (despesas)
const STOCK_OUTFLOW_TYPES = Object.freeze([
  MOVEMENT_TYPE.FORNECIMENTO_ORG,
  MOVEMENT_TYPE.CONSUMO_SAIDA,
  MOVEMENT_TYPE.PERDA_SAIDA,
]);

// Movimentos que contam para promoções e rankings de contribuição
const CONTRIBUTION_TYPES = Object.freeze([
  MOVEMENT_TYPE.ENTREGA_BAIRRISTA,
  MOVEMENT_TYPE.ENTREGA_OFICIAL,
  MOVEMENT_TYPE.VENDA_BAIRRISTA,
]);

// Movimentos de entrega (não vendas)
const DELIVERY_TYPES = Object.freeze([
  MOVEMENT_TYPE.ENTREGA_BAIRRISTA,
  MOVEMENT_TYPE.ENTREGA_OFICIAL,
]);

// Movimentos de venda
const SALE_TYPES = Object.freeze([
  MOVEMENT_TYPE.VENDA_BAIRRISTA,
]);

// Helper: converte array de tipos para string SQL IN (...)
function sqlIn(types) {
  return types.map(t => `'${t}'`).join(',');
}

module.exports = {
  MOVEMENT_TYPE,
  STOCK_INFLOW_TYPES,
  STOCK_OUTFLOW_TYPES,
  CONTRIBUTION_TYPES,
  DELIVERY_TYPES,
  SALE_TYPES,
  sqlIn,
};
