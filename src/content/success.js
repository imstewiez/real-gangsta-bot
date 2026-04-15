'use strict';
/**
 * Confirmações — curtas, pragmáticas, sem festividade.
 *
 * Preferir voz passiva curta: "Material registado.", "Movimento fechado."
 * — não "Operação concluída com sucesso".
 */

const E = require('./emojis');

const SUCCESS = {
  GENERIC: () =>
    `${E.OK} Feito.`,

  SAVED: (what) =>
    `${E.OK} ${what} registado.`,

  UPDATED: (what) =>
    `${E.OK} ${what} actualizado.`,

  REMOVED: (what) =>
    `${E.OK} ${what} removido.`,

  CLOSED: (what) =>
    `${E.FECHAR} ${what} fechado.`,

  PUBLISHED: (where) =>
    `${E.OK} Publicado em <#${where}>.`,

  // Saídas
  SAIDA_CREATED: (id) =>
    `${E.SAIDA} Saída **#${id}** aberta.`,

  SAIDA_CLOSED: (id) =>
    `${E.FECHAR} Saída **#${id}** fechada.`,

  PARTICIPANT_ADDED: (name) =>
    `${E.OK} ${name} entra no movimento.`,

  PARTICIPANT_REMOVED: (name) =>
    `${E.OK} ${name} fora do movimento.`,

  // Inventário
  STOCK_ADJUSTED: (item, delta) =>
    `${E.AJUSTAR} ${item} ${delta >= 0 ? '+' : ''}${delta}.`,

  MATERIAL_ISSUED: (name, item, qty) =>
    `${E.FORNECER} ${qty}× ${item} fornecido a ${name}.`,

  MATERIAL_RETURNED: (name, item, qty) =>
    `${E.DEVOLVER} ${qty}× ${item} devolvido por ${name}.`,

  // Presença
  VOTE_RECORDED: (slot, label) =>
    `${E.OK} Presença: **${slot}** → **${label}**.`,

  VOTE_BULK: (n, label) =>
    `${E.OK} ${n} slots marcados como **${label}**.`,

  // Sticky
  STICKY_SET: (channelId) =>
    `${E.STICKY} Sticky activa em <#${channelId}>.`,

  STICKY_REFRESH: () =>
    `${E.REFRESH} Sticky actualizada.`,

  // Rádio
  RADIO_SET: (label, prev, next) =>
    `${E.RADIO} ${label}: \`${prev || '—'}\` → \`${next}\`.`,

  RADIO_SWAP: (a, b) =>
    `${E.RADIO} Trocadas: \`${a}\` ↔ \`${b}\`.`,
};

module.exports = SUCCESS;
