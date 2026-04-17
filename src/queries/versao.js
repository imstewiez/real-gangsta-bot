'use strict';
/**
 * /versao — estado do bot + saúde dos dados (esta última só para staff).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { getCurrentInstance } = require('../instanceCoordinator');
const { canManageStructure } = require('../permissions/permissionEngine');

async function handle(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const inst = getCurrentInstance();
  if (!inst) {
    return safeReply(interaction, { content: 'Instância ainda não registada.' }, { dismissible: true });
  }
  const lines = [
    `**Firma RedWood** · ${inst.version || '?'}${inst.gitSha ? ` · \`${inst.gitSha.slice(0, 7)}\`` : ''}`,
    `${EMOJI.CASA} \`${inst.hostname}\` · pid \`${inst.pid}\` · <t:${Math.floor(new Date(inst.startedAt).getTime() / 1000)}:R>`,
  ];

  // Saúde dos dados (staff only) — antigo /rg-data-health absorvido aqui
  if (canManageStructure(interaction.member)) {
    try {
      const { collect, formatDiscord } = require('../lib/dataHealth');
      const report = await collect({ guild: interaction.guild });
      lines.push('', formatDiscord(report));
    } catch {
      /* silent */
    }
  }

  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
}

module.exports = { handle };
