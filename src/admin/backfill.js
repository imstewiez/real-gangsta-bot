'use strict';
/**
 * /backfill — importar membros Discord com role RP para a DB.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { ERRORS, EMOJI } = require('../content');
const { canManageStructure } = require('../permissions/permissionEngine');
const { backfillMembers } = require('../members/backfill');

async function handle(interaction) {
  if (!canManageStructure(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('backfill membros'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const modo = interaction.options.getString('modo') || 'dry-run';
  const dryRun = modo === 'dry-run';
  const r = await backfillMembers(interaction.guild, {
    dryRun,
    actor: `discord:${interaction.user.id}`,
  });
  const tag = dryRun ? '**DRY-RUN**' : '**APLICADO**';
  const lines = [
    `${tag} · Backfill de membros concluído`,
    `• Scanned: ${r.scanned}  ·  Bots: ${r.skippedBot}  ·  Sem role RP: ${r.skippedNoRole}`,
    `• Criados: ${r.created}  ·  Actualizados: ${r.updated}  ·  Sem mudança: ${r.unchanged}`,
    r.errors.length ? `${EMOJI.WARN} Erros: ${r.errors.length} (ver logs)` : '',
  ].filter(Boolean);
  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
}

module.exports = { handle };
