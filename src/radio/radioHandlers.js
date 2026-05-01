'use strict';
/**
 * Handlers para botões do painel de rádio.
 *
 * customIds:
 *   radio::random::<type>    botão — gera aleatória para <type>
 */

const { MessageFlags } = require('discord.js');
const CONFIG = require('../config');
const { radioRepo } = require('../repositories');
const {
  setRandom,
  buildEmbed,
  buildComponents,
  TYPE_META,
  notifyStickyChange,
} = require('./radioEngine');
const { safeReply } = require('../shared/interactionHelpers');
const { successEmbed } = require('../shared/embedBuilders');
const { isCommand, isOficial } = require('../permissions/permissionEngine');
const { RADIO, EMOJI } = require('../content');
const { warn } = require('../logger');

// OG+ = Comando (Kingpin, Manda-Chuva) ou OG.
// Exclui Real Gangster.
function _canManageRadio(member) {
  const { memberRoleIds } = require('../permissions/permissionEngine');
  return isCommand(member) || memberRoleIds(member).has(CONFIG.OG_ROLE_ID);
}

async function _denyIfNotOG(interaction) {
  if (_canManageRadio(interaction.member)) return false;
  await safeReply(
    interaction,
    {
      content: `${EMOJI.BLOQUEADO} Apenas OG+ (Kingpin, Manda-Chuva ou OG) pode alterar a rádio.`,
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL' }
  );
  return true;
}

function parseId(customId) {
  return customId.split('::');
}

async function refreshMessage(interaction) {
  try {
    const states = await radioRepo.getAllStates();
    await interaction.message.edit({
      embeds: [buildEmbed(states)],
      components: buildComponents(),
    });
  } catch (e) {
    warn(`[RADIO] refreshMessage falhou: ${e.message}`);
  }
}

async function handleRandom(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  const [, , type] = parseId(interaction.customId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await setRandom({ type, actorId: interaction.user.id });
    await refreshMessage(interaction);
    notifyStickyChange(interaction.client).catch(() => {});

    // Mencionar roles no canal
    try {
      const mentions = [];
      if (CONFIG.REDWOOD_ROLE_ID) mentions.push(`<@&${CONFIG.REDWOOD_ROLE_ID}>`);
      if (CONFIG.BAIRRISTAS_ROLE_ID) mentions.push(`<@&${CONFIG.BAIRRISTAS_ROLE_ID}>`);
      if (mentions.length) {
        await interaction.channel.send(
          `${mentions.join(' ')} 📻 **Nova Frequência:** \`${result.value}\``
        );
      }
    } catch (e) {
      warn(`[RADIO] mention falhou: ${e.message}`);
    }

    const meta = TYPE_META[type];
    const embed = successEmbed(
      RADIO.RANDOM_TITLE,
      `**${meta.label}**\n${RADIO.LABELS.ANTES}: \`${result.previous || '—'}\`\n${RADIO.LABELS.AGORA}: \`${result.value}\``
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'RESULT' });
  }
}

module.exports = {
  handleRandom,
};
