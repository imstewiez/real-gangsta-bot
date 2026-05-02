'use strict';
/**
 * Shared UI — select-menu builders consistentes para painéis e fluxos.
 */

const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');

function selectOption({ label, value, description = '', emoji }) {
  const opt = new StringSelectMenuOptionBuilder().setLabel(label).setValue(value);
  if (description) opt.setDescription(description);
  if (emoji) opt.setEmoji(emoji);
  return opt;
}

function selectMenu({ customId, placeholder, options, minValues = 1, maxValues = 1 }) {
  const builder = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(minValues)
    .setMaxValues(maxValues);
  for (const opt of options) {
    builder.addOptions(selectOption(opt));
  }
  return builder;
}

function selectRow(selectComponent) {
  return new ActionRowBuilder().addComponents(selectComponent);
}

module.exports = { selectMenu, selectRow, selectOption };
