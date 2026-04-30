'use strict';
/**
 * /catalogo — lista completa de itens agrupados por categoria.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { inventoryRepo } = require('../repositories');

async function handle(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const items = await inventoryRepo.getItems(true);
  if (!items.length) {
    return safeReply(interaction, { content: 'Catálogo vazio.' }, { messageClass: 'BANAL' });
  }
  const grouped = {};
  for (const item of items) {
    (grouped[item.category] = grouped[item.category] || []).push(item);
  }
  const lines = [];
  for (const [cat, catItems] of Object.entries(grouped)) {
    lines.push(`**${cat.toUpperCase()}**`);
    for (const item of catItems) {
      const price = item.estimated_value ? ` (${Number(item.estimated_value).toLocaleString('pt-PT')}€)` : '';
      lines.push(`  ${item.name} — ${item.unit}${price}`);
    }
  }
  const embed = brandEmbed().setTitle('Catálogo de Materiais').setDescription(lines.join('\n').slice(0, 4000));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = { handle };
