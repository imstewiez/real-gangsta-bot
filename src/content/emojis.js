'use strict';
/**
 * Paleta curada de emojis — um por função, sem duplicações.
 *
 * Regra: cada chamada ao código usa o alias semântico (ex.: EMOJI.SAIDA),
 * nunca o codepoint bruto. Garante consistência e troca global num só sítio.
 *
 * Princípios:
 *   - Cada conceito tem UM emoji único (zero duplicações semânticas)
 *   - Máximo 1 emoji por título de embed
 *   - Emojis ancoram significado, não "fofura"
 *   - Paleta coerente com identidade bairro/firma (sem infantilidade)
 */

const EMOJI = {
  // ── Marca / identidade ─────────────────────────────────────────────────
  FIRMA: '🔥',
  CASA: '🏠',
  BAIRRO: '🌃',
  RUA: '🛣️',
  ZONA: '📍',

  // ── Saídas / movimento ─────────────────────────────────────────────────
  SAIDA: '🏴',
  MOVIMENTO: '🚶',
  LIDER: '👑',
  PARTICIPANTE: '👥',
  CONVOCAR: '📣',

  // ── Resultados combate ─────────────────────────────────────────────────
  VITORIA: '🎖️',
  DERROTA: '☠️',
  EMPATE: '⚖️',
  KILL: '🎯',
  MORTE: '⚰️',
  DOWN: '🤕',
  MVP: '🏅',
  COMBATE: '⚔️',
  SPOT: '🗺️',

  // ── Material / inventário ──────────────────────────────────────────────
  MATERIAL: '📦',
  STOCK: '📊',
  CRAFT: '🛠️',
  FORNECER: '🧰',
  DEVOLVER: '↩️',
  PERDIDO: '💀',
  DINHEIRO: '💵',
  LUCRO: '💰',
  VENDA: '💸',
  ENTREGA: '📥',

  // ── Rádio ──────────────────────────────────────────────────────────────
  RADIO: '📻',
  FREQUENCIA: '🔊',

  // ── Presença / disponibilidade ─────────────────────────────────────────
  DISPONIVEL: '✅',
  INDISPONIVEL: '❌',
  TALVEZ: '❔',
  PRESENCA: '🙋',

  // ── Rankings / progressão ──────────────────────────────────────────────
  TOPO: '🏆',
  PROGRESSO: '📈',
  STREAK: '⚡',
  MEDAL_1: '🥇',
  MEDAL_2: '🥈',
  MEDAL_3: '🥉',

  // ── Perfil operacional — drill-downs ───────────────────────────────────
  ENCOMENDA: '📋',
  HISTORICO: '📜',
  VOLTAR: '⬅️',

  // ── Estados gerais ─────────────────────────────────────────────────────
  OK: '✅',
  WARN: '⚠️',
  ERRO: '⛔',
  INFO: 'ℹ️',
  PENDENTE: '⏳',
  BLOQUEADO: '🔒',
  DUPLICADO: '⏱️',

  // ── Acções ─────────────────────────────────────────────────────────────
  NOVO: '➕',
  FECHAR: '🏁',
  EDITAR: '✏️',
  APAGAR: '🗑️',
  VER: '👁️',
  REFRESH: '🔄',
  AJUSTAR: '🔧',

  // ── Stickys / pins ─────────────────────────────────────────────────────
  STICKY: '📌',
  AUDIT: '📝',

  // ── Onboarding ─────────────────────────────────────────────────────────
  ENTRADA: '🚪',
  BEMVINDO: '👋',
  TAG: '🏷️',
  SANGUE: '🩸',
  LEIS: '📖',

  // ── Negativos / bloqueios ──────────────────────────────────────────────
  NO_PERMISSION: '🚫',
  NOT_FOUND: '🔍',
};

module.exports = EMOJI;
