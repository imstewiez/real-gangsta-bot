'use strict';
/**
 * /rebuildsheet — reconstruir workbook Google Sheets completo.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { ERRORS, EMOJI } = require('../content');
const { canManageStructure } = require('../permissions/permissionEngine');

async function handle(interaction) {
  if (!canManageStructure(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('rebuild sheets'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const purge = interaction.options.getBoolean('purge') || false;
  const { rebuildWorkbook } = require('../sheets/syncEngine');
  const r = await rebuildWorkbook(null, { purgeOthers: purge });
  if (r.skipped) {
    return safeReply(interaction, { content: `${EMOJI.WARN} Skipped: ${r.skipped}` }, { dismissible: true });
  }
  const purgedTag = r.purged ? ' (lixo apagado)' : '';
  return safeReply(interaction, {
    content: `${EMOJI.REFRESH} Rebuild${purgedTag} em ${r.ms}ms — ${r.results.length} tabs OK, ${r.errors.length} erros.`,
  }, { dismissible: true });
}

module.exports = { handle };
