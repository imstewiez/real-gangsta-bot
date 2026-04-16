'use strict';
/**
 * Paleta curada de emojis — um por função, sem spam.
 *
 * Regra: cada chamada ao código usa o alias semântico (ex.: EMOJI.SAIDA),
 * nunca o codepoint bruto. Isto garante consistência e troca global num só sítio.
 *
 * Filosofia:
 *   - Máximo 1 emoji por título de embed.
 *   - Nenhum emoji a decorar final de linha.
 *   - Emojis ancoram significado, não "fofura".
 */

const EMOJI = {
  // Marca / identidade
  FIRMA: '🔥',
  CASA: '🏠',
  RUA: '🛣️',
  ZONA: '📍',

  // Saídas / movimento
  SAIDA: '🏴',
  MOVIMENTO: '🏴',
  LIDER: '👑',
  PARTICIPANTE: '👥',
  CONVOCAR: '📣',

  // Resultados
  VITORIA: '🏆',
  DERROTA: '☠️',
  EMPATE: '⚖️',
  KILL: '🎯',
  MORTE: '⚰️',
  DOWN: '🤕',
  MVP: '🏅',

  // Material / inventário
  MATERIAL: '📦',
  STOCK: '📊',
  CRAFT: '🛠️',
  FORNECER: '🎯',
  DEVOLVER: '↩️',
  PERDIDO: '💀',
  DINHEIRO: '💵',
  LUCRO: '💰',

  // Rádio
  RADIO: '📻',
  FREQUENCIA: '🔊',

  // Presença / disponibilidade
  DISPONIVEL: '✅',
  INDISPONIVEL: '❌',
  TALVEZ: '❔',
  PRESENCA: '📍',

  // Rankings / progressão
  TOPO: '🏆',
  PROGRESSO: '📈',
  STREAK: '🔥',
  MEDAL_1: '🥇',
  MEDAL_2: '🥈',
  MEDAL_3: '🥉',

  // Perfil operacional — drill-downs
  COMBATE: '⚔️',
  ENCOMENDA: '📋',
  HISTORICO: '📜',
  VOLTAR: '↩️',
  ENTREGA: '📥',
  VENDA: '💰',
  SPOT: '🎯',

  // Estados gerais
  OK: '✅',
  WARN: '⚠️',
  ERRO: '⛔',
  INFO: 'ℹ️',
  PENDENTE: '⏳',
  BLOQUEADO: '🔒',
  DUPLICADO: '⏱️',

  // Acções
  NOVO: '➕',
  FECHAR: '🏁',
  EDITAR: '✏️',
  APAGAR: '🗑️',
  VER: '👁️',
  REFRESH: '🔄',
  AJUSTAR: '🔧',

  // Stickys / pins
  STICKY: '📌',
  AUDIT: '📝',

  // Onboarding
  ENTRADA: '🚪',
  BEMVINDO: '👋',
  TAG: '🏷️',

  // Negativos / bloqueios
  NO_PERMISSION: '🚫',
  NOT_FOUND: '🔍',
};

module.exports = EMOJI;
