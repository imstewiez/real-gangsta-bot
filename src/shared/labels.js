'use strict';
/**
 * Label Registry — ÚNICA fonte de verdade para mapear enums técnicos
 * para texto bonito, emojis e cores. Nenhum embed deve mostrar raw DB enums.
 *
 * Regras:
 *   - Todas as chaves são os valores crus da DB (snake_case, lowercase).
 *   - Todos os valores têm { label, emoji? } — prontos para embeds.
 *   - Nunca formatar inline nos handlers; sempre lookup aqui.
 */

const E = require('../content/emojis');

// ═══════════════════════════════════════════════════════════════════════════
// MOVEMENT TYPES — inventory_movements.movement_type
// ═══════════════════════════════════════════════════════════════════════════

const MOVEMENT_TYPE = {
  entrega_bairrista: { label: 'Entrega', emoji: E.ENTREGA, color: 'green' },
  entrega_oficial: { label: 'Entrega', emoji: E.ENTREGA, color: 'green' },
  venda_bairrista: { label: 'Venda', emoji: E.VENDA, color: 'gold' },
  fornecimento_org: { label: 'Fornecimento', emoji: E.FORNECER, color: 'blue' },
  devolucao_saida: { label: 'Devolução', emoji: E.DEVOLVER, color: 'purple' },
  perda_saida: { label: 'Perda', emoji: E.PERDIDO, color: 'red' },
  consumo_saida: { label: 'Consumo', emoji: '🔥', color: 'orange' },
  ajuste_manual: { label: 'Ajuste', emoji: E.AJUSTAR, color: 'grey' },
  apreendido: { label: 'Apreendido', emoji: '🚔', color: 'red' },
  craftado: { label: 'Craft', emoji: E.CRAFT, color: 'teal' },
  saldo_inicial: { label: 'Saldo Inicial', emoji: '📊', color: 'blue' },
};

function fmtMovementType(raw) {
  const m = MOVEMENT_TYPE[raw];
  if (!m) return raw;
  return `${m.emoji} ${m.label}`;
}

function fmtMovementTypeShort(raw) {
  const m = MOVEMENT_TYPE[raw];
  if (!m) return raw;
  return m.label;
}

// ═══════════════════════════════════════════════════════════════════════════
// ORDER STATUS — orders.status
// ═══════════════════════════════════════════════════════════════════════════

const ORDER_STATUS = {
  pending: { label: 'Pendente', emoji: '⏳', color: 'yellow' },
  approved: { label: 'Aprovada', emoji: '✅', color: 'green' },
  in_progress: { label: 'Em processo', emoji: '🔧', color: 'blue' },
  ready: { label: 'Pronta', emoji: '📦', color: 'purple' },
  fulfilled: { label: 'Entregue', emoji: E.OK, color: 'green' },
  denied: { label: 'Recusada', emoji: '⛔', color: 'red' },
  cancelled: { label: 'Cancelada', emoji: '🚫', color: 'grey' },
};

function fmtOrderStatus(raw) {
  const s = ORDER_STATUS[raw];
  if (!s) return raw;
  return `${s.emoji} ${s.label}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAÍDA STATUS — operations.status
// ═══════════════════════════════════════════════════════════════════════════

const SAIDA_STATUS = {
  criada: { label: 'Criada', emoji: '📢', color: 'green' },
  em_preparacao: { label: 'A preparar', emoji: '📋', color: 'yellow' },
  em_curso: { label: 'Na rua', emoji: '🚗', color: 'blue' },
  em_liquidacao: { label: 'Em liquidação', emoji: E.FECHAR, color: 'purple' },
  concluida: { label: 'Fechada', emoji: E.OK, color: 'green' },
  cancelada: { label: 'Cancelada', emoji: E.ERRO, color: 'red' },
};

function fmtSaidaStatus(raw) {
  const s = SAIDA_STATUS[raw];
  if (!s) return raw;
  return `${s.emoji} ${s.label}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAÍDA TYPE — operations.operation_type
// ═══════════════════════════════════════════════════════════════════════════

const SAIDA_TYPE = {
  craft: { label: 'Craft', emoji: E.CRAFT },
  dominio: { label: 'Domínio', emoji: '👑' },
  ataque: { label: 'Ataque', emoji: '⚔️' },
  defesa: { label: 'Defesa', emoji: '🛡️' },
  recolha: { label: 'Recolha', emoji: '📦' },
  outra: { label: 'Outra', emoji: '❓' },
};

function fmtSaidaType(raw) {
  const s = SAIDA_TYPE[raw];
  if (!s) return raw;
  return `${s.emoji} ${s.label}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTICIPANT TYPE — operation_participants.participant_type
// ═══════════════════════════════════════════════════════════════════════════

const PARTICIPANT_TYPE = {
  caracterizado: { label: 'Caracterizado', emoji: E.KILL },
  trabalhador: { label: 'Trabalhador', emoji: E.MATERIAL },
  pending: { label: 'Pendente', emoji: E.PENDENTE },
  requested: { label: 'Pedido de entrada', emoji: '🔔' },
};

function fmtParticipantType(raw) {
  const p = PARTICIPANT_TYPE[raw];
  if (!p) return raw;
  return `${p.emoji} ${p.label}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE / TIER — members.role / members.tier
// ═══════════════════════════════════════════════════════════════════════════

const ROLE = {
  bairrista: { label: 'Bairrista', emoji: E.MATERIAL },
  patrao_di_zona: { label: 'Patrão di Zona', emoji: E.LIDER },
  oficial: { label: 'Oficial', emoji: E.OFICIAL },
  chefia: { label: 'Chefia', emoji: E.CHEFIA },
  inativo: { label: 'Inactivo', emoji: E.INATIVO },
  pendente: { label: 'Pendente', emoji: E.PENDENTE },
};

const TIER = {
  young_blood: { label: 'Young Blood', emoji: '🩸' },
  o_gunao: { label: 'O Gunão', emoji: '🔫' },
  gangster_fodido: { label: 'Gangster Fodido', emoji: '💀' },
};

function fmtRole(raw) {
  const r = ROLE[raw];
  if (!r) return raw;
  return `${r.emoji} ${r.label}`;
}

function fmtTier(raw) {
  const t = TIER[raw];
  if (!t) return raw;
  return `${t.emoji} ${t.label}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT — operations.result (reexporta de content/saidas para centralizar)
// ═══════════════════════════════════════════════════════════════════════════

const { RESULT_LABEL } = require('../content/saidas');

function fmtResult(raw) {
  return RESULT_LABEL[raw] || raw;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Maps
  MOVEMENT_TYPE,
  ORDER_STATUS,
  SAIDA_STATUS,
  SAIDA_TYPE,
  PARTICIPANT_TYPE,
  ROLE,
  TIER,
  // Formatters
  fmtMovementType,
  fmtMovementTypeShort,
  fmtOrderStatus,
  fmtSaidaStatus,
  fmtSaidaType,
  fmtParticipantType,
  fmtRole,
  fmtTier,
  fmtResult,
};
