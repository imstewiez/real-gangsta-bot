'use strict';
/**
 * /stock — stock global ou per-item (se 'item' fornecido).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { handleStockCommand } = require('../inventory/inventoryHandlers');

async function handle(interaction) {
  const itemName = interaction.options.getString('item');
  if (!itemName) return handleStockCommand(interaction);

  // Item específico (por casa)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sm = require('../inventory/stockManager');
  const item = await sm.findItemByName(itemName);
  if (!item) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Item não encontrado: \`${itemName}\``,
      },
      { messageClass: 'BANAL' }
    );
  }
  const ar = await sm.getCurrentStock(item.id, 'armazem');
  const gr = await sm.getCurrentStock(item.id, 'grupo');
  const total = ar + gr;
  const value = (Number(item.estimated_value) || 0) * total;
  return safeReply(
    interaction,
    {
      content:
        `${EMOJI.MATERIAL} **${item.name}** _${item.category}_\n` +
        `${EMOJI.CASA} Armazém: \`${ar}\` · Grupo: \`${gr}\`\n` +
        `▸ Total: **${total}** un. (≈ ${Math.round(value).toLocaleString('pt-PT')}€)`,
    },
    { messageClass: 'BANAL' }
  );
}

module.exports = { handle };
