'use strict';
/**
 * /republicar-precos — força republicação do embed de preços e fórmulas.
 * Staff only (chefia+).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');
const { isChefia } = require('../permissions/permissionEngine');
const { publishPriceListEmbed } = require('../prices/priceListPublisher');

async function handle(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await publishPriceListEmbed(interaction.client);

  if (result.success) {
    return safeReply(
      interaction,
      {
        content: `✅ Embed de preços republicado com sucesso (${result.action}).`,
      },
      { messageClass: 'RESULT' }
    );
  }

  return safeReply(
    interaction,
    {
      content: `❌ Erro ao republicar embed: ${result.reason}${result.error ? ` — ${result.error}` : ''}.`,
    },
    { messageClass: 'ERROR' }
  );
}

module.exports = { handle };
