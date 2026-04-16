'use strict';
/**
 * /reconcile — detectar e corrigir drift DB↔Discord.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { ERRORS, EMOJI } = require('../content');
const { canManageStructure } = require('../permissions/permissionEngine');
const { runReconcile } = require('../reconcile');

async function handle(interaction) {
  if (!canManageStructure(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('reconcile'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const dominio = interaction.options.getString('dominio');
  const modo = interaction.options.getString('modo');
  const dryRun = modo === 'dry-run';

  const r = await runReconcile({
    domain: dominio,
    guild: interaction.guild,
    dryRun,
    actor: `discord:${interaction.user.id}`,
  });

  const tag = dryRun ? '**DRY-RUN**' : '**APLICADO**';
  const lines = [`${tag} · Reconcile \`${dominio}\` em ${r.ms}ms`, ''];

  for (const [d, entry] of Object.entries(r.per_domain)) {
    if (entry.error) {
      lines.push(`${EMOJI.ERRO} **${d}**: ${entry.error}`);
      continue;
    }
    const c = entry.check;
    const driftBits = [];
    if (c.role_mismatch?.length) driftBits.push(`${c.role_mismatch.length} role mismatch`);
    if (c.tier_mismatch?.length) driftBits.push(`${c.tier_mismatch.length} tier mismatch`);
    if (c.missing_in_db?.length) driftBits.push(`${c.missing_in_db.length} missing`);
    if (c.orphan_in_db?.length) driftBits.push(`${c.orphan_in_db.length} orphan`);
    if (c.stale?.length) driftBits.push(`${c.stale.length} stale tabs`);
    if (c.errors?.length) driftBits.push(`${c.errors.length} error tabs`);
    if (c.never_synced?.length) driftBits.push(`${c.never_synced.length} never synced`);
    if (c.channels_missing?.length) driftBits.push(`${c.channels_missing.length} missing channels`);
    const summary = c.has_drift ? driftBits.join(' · ') : `${c.ok} ok, sem drift`;
    const apply = entry.apply ? ` → ${EMOJI.OK} ${entry.apply.corrected} corrigidos` : '';
    lines.push(`🔍 **${d}**: ${c.total_checked} verificados · ${summary}${apply}`);
  }

  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
}

module.exports = { handle };
