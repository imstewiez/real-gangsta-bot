'use strict';
/**
 * Catálogo formal de domain events.
 * Cada evento é declarado aqui — novos eventos devem ser adicionados
 * antes de serem emitidos. Projections e subscribers validam contra este catálogo.
 *
 * Campos:
 *   description — o que o evento representa
 *   tabs        — tabs do Google Sheets invalidadas (copiadas de EVENT_TO_TABS em projections.js)
 *
 * Firma RedWood
 */

const EVENTS = {
  // ── Membros ─────────────────────────────────────────────────────────────────
  'member.joined':           { description: 'Novo membro registado na DB (backfill ou onboarding)', tabs: ['membros', 'dashboard'] },
  'member.onboarded':        { description: 'Tag aprovada — bairrista criado na DB', tabs: ['membros', 'dashboard'] },
  'member.left':             { description: 'Membro saiu do servidor', tabs: ['membros', 'resumo', 'dashboard'] },
  'member.promoted':         { description: 'Bairrista subiu de tier (onboarding manual)', tabs: ['membros', 'dashboard'] },
  'member.tier_changed':     { description: 'Tier alterado (auto-promoção ou lifecycle)', tabs: ['membros', 'resumo', 'dashboard'] },
  'member.nickname_changed': { description: 'Nickname alterado no Discord', tabs: ['membros'] },

  // ── Material / Inventário ───────────────────────────────────────────────────
  'material.registered':  { description: 'Entrega ou venda de material registada', tabs: ['stock', 'resumo', 'dashboard', 'membros'] },
  'material.adjusted':    { description: 'Stock ajustado manualmente', tabs: ['stock', 'resumo', 'dashboard'] },
  'material.transferred': { description: 'Material movido entre casas (armazém ↔ grupo)', tabs: ['stock', 'dashboard'] },

  // ── Encomendas ──────────────────────────────────────────────────────────────
  'order.created':   { description: 'Encomenda criada por um bairrista', tabs: ['stock', 'dashboard'] },
  'order.approved':  { description: 'Encomenda aprovada pela chefia', tabs: ['stock', 'dashboard'] },
  'order.fulfilled': { description: 'Encomenda entregue / cumprida', tabs: ['stock', 'dashboard'] },
  'order.denied':    { description: 'Encomenda recusada', tabs: ['stock'] },
  'order.cancelled': { description: 'Encomenda cancelada', tabs: ['stock'] },

  // ── Saídas ──────────────────────────────────────────────────────────────────
  'saida.opened':            { description: 'Nova sessão de saída criada', tabs: ['saidas', 'resumo', 'dashboard'] },
  'saida.started':           { description: 'Saída iniciada (fase activa)', tabs: ['saidas'] },
  'saida.em_liquidacao':     { description: 'Saída entrou em fase de liquidação', tabs: [] },
  'saida.closed':            { description: 'Saída fechada com resultado e totais', tabs: ['saidas', 'resumo', 'dashboard', 'membros'] },
  'saida.participant_added': { description: 'Participante inscrito numa saída', tabs: ['saidas'] },
  'saida.material_issued':   { description: 'Material emitido para participante de saída', tabs: ['saidas', 'stock'] },
  'saida.individual_result': { description: 'Resultado individual registado (kills, morte, devolução)', tabs: [] },

  // ── Kills ───────────────────────────────────────────────────────────────────
  'kill.registered': { description: 'Kill adicionada ao cemitério', tabs: ['saidas', 'dashboard'] },

  // ── Armas — decisão de devolução ────────────────────────────────────────────
  'weapon.return_confirmed':   { description: 'Devolução de arma confirmada pela chefia', tabs: ['saidas', 'membros', 'dashboard'] },
  'weapon.return_rejected':    { description: 'Devolução de arma rejeitada pela chefia', tabs: ['saidas', 'membros', 'dashboard'] },
  'weapon.return_inconclusive': { description: 'Devolução de arma marcada como inconclusiva', tabs: [] },

  // ── Planeados (documentados, ainda não emitidos) ────────────────────────────
  'item.price_changed': { description: 'Preço de item alterado no catálogo (planeado)', tabs: [] },
  'ranking.recomputed': { description: 'Rankings recalculados — mensal/all-time (planeado)', tabs: [] },
};

const EVENT_NAMES = Object.keys(EVENTS);

/**
 * Verifica se um evento pertence ao catálogo formal.
 * @param {string} name — nome do evento (e.g. 'saida.closed')
 * @returns {boolean}
 */
function isKnownEvent(name) {
  return name in EVENTS;
}

module.exports = { EVENTS, EVENT_NAMES, isKnownEvent };
