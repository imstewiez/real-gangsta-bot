'use strict';
/**
 * /perms — sincronizar permissões Discord + reconcile canais individuais.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { ERRORS } = require('../content');
const { canManageStructure } = require('../permissions/permissionEngine');
const { runPermsOnly, summarize: summarizePerms } = require('../discord/structureSync');
const { reconcileBairristaChannels } = require('../members/channelInvariants');

async function handle(interaction) {
  if (!canManageStructure(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('sync perms'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const modo = interaction.options.getString('modo') || 'dry-run';
  const apply = modo === 'apply';
  const report = await runPermsOnly(interaction.guild, { apply });

  // Reconcile canais individuais — garante isolamento entre bairristas
  const chReport = await reconcileBairristaChannels(interaction.guild, { dryRun: !apply });

  const summary = summarizePerms(report);
  const chSummary = `\n\n**Canais individuais de bairristas:** scanned=${chReport.scanned} · fixed=${chReport.fixed} · missing=${chReport.missing} · errors=${chReport.errors.length}`;
  return safeReply(interaction, {
    content: (summary + chSummary).slice(0, 1900),
  }, { dismissible: true });
}

module.exports = { handle };
