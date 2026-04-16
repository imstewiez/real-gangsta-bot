'use strict';
/**
 * Shared UI — button builders consistentes para painéis e fluxos.
 *
 * A camada `src/content/*` define o label/style/emoji de cada acção
 * (`BUTTONS.CHEFIA.CRIAR_SAIDA = { label, style, emoji }`). Estes helpers
 * transformam essas definições em ButtonBuilders sem repetir o pattern
 * `.setCustomId().setLabel().setStyle(ButtonStyle[...]).setEmoji()` em
 * cada painel.
 */

const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

/**
 * Factory a partir de uma definição `{ label, style, emoji }`.
 * Style pode ser string (nome do enum) ou valor numérico do enum.
 */
function buttonFromDef(customId, def) {
  if (!def) throw new Error(`buttonFromDef: def em falta para ${customId}`);
  const builder = new ButtonBuilder().setCustomId(customId).setLabel(def.label);
  if (typeof def.style === 'string') builder.setStyle(ButtonStyle[def.style]);
  else if (typeof def.style === 'number') builder.setStyle(def.style);
  else builder.setStyle(ButtonStyle.Secondary);
  if (def.emoji) builder.setEmoji(def.emoji);
  if (def.url) builder.setURL(def.url);
  if (def.disabled) builder.setDisabled(true);
  return builder;
}

/**
 * Botão simples por parâmetros (sem passar por content layer).
 * Útil para botões one-off (URLs externas, estados dinâmicos).
 */
function button({ customId, label, style = 'Secondary', emoji, url, disabled = false }) {
  const builder = new ButtonBuilder();
  if (url) builder.setURL(url);
  else if (customId) builder.setCustomId(customId);
  builder.setLabel(label);
  builder.setStyle(typeof style === 'string' ? ButtonStyle[style] : style);
  if (emoji) builder.setEmoji(emoji);
  if (disabled) builder.setDisabled(true);
  return builder;
}

/** Action row a partir de lista de ButtonBuilders (até 5 por row). */
function buttonRow(...buttons) {
  if (buttons.length > 5) throw new Error('buttonRow: máximo 5 botões por row.');
  return new ActionRowBuilder().addComponents(...buttons);
}

/**
 * Constrói várias rows a partir de uma lista plana (auto-chunk de 5).
 * Útil quando o painel tem muitos botões do mesmo tipo.
 */
function buttonRows(buttons, perRow = 5) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + perRow)));
  }
  return rows;
}

module.exports = {
  buttonFromDef,
  button,
  buttonRow,
  buttonRows,
  ButtonStyle,
};
