'use strict';
/**
 * /transfer — mover material entre casas (armazém ↔ grupo).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sm = require('../inventory/stockManager');
  const itemName = interaction.options.getString('item');
  const item = await sm.findItemByName(itemName);
  if (!item) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Item não encontrado: \`${itemName}\``,
      },
      { messageClass: 'ERROR' }
    );
  }
  try {
    const qty = interaction.options.getInteger('quantidade');
    if (!qty || qty <= 0 || qty > 999999) {
      return safeReply(interaction, {
        content: `${EMOJI.ERRO} Quantidade inválida. Deve ser entre 1 e 999999.`,
      }, { messageClass: 'ERROR' });
    }
    const de = interaction.options.getString('de');
    const para = interaction.options.getString('para');
    const nota = interaction.options.getString('nota') || '';
    const actor = `discord:${interaction.user.id}`;
    await sm.transferStock({ itemId: item.id, quantity: qty, fromLocation: de, toLocation: para, actor, notes: nota });
    const ar = await sm.getCurrentStock(item.id, 'armazem');
    const gr = await sm.getCurrentStock(item.id, 'grupo');
    return safeReply(
      interaction,
      {
        content: `${EMOJI.REFRESH} Transferido **${qty}× ${item.name}**: ${de} → ${para}\nArmazém: \`${ar}\` · Grupo: \`${gr}\``,
      },
      { messageClass: 'ERROR' }
    );
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

module.exports = { handle };
