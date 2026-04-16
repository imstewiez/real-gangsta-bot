'use strict';
/**
 * /syncsheet — sincronizar Google Sheet (tab opcional).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { ERRORS, EMOJI } = require('../content');
const { canManageStructure } = require('../permissions/permissionEngine');

async function handle(interaction) {
  if (!canManageStructure(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('sync sheets'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const tab = interaction.options.getString('tab');
  if (tab) {
    const { syncOne } = require('../sheets/syncEngine');
    try {
      const r = await syncOne(tab);
      if (r.skipped) {
        return safeReply(interaction, { content: `${EMOJI.WARN} Skipped: ${r.skipped}` }, { dismissible: true });
      }
      return safeReply(interaction, {
        content: `${EMOJI.OK} Tab **${tab}**: ${r.ops} ops em ${r.ms}ms.`,
      }, { dismissible: true });
    } catch (e) {
      return safeReply(interaction, { content: `${EMOJI.ERRO} ${tab}: ${e.message}` }, { dismissible: true });
    }
  }

  // Sync completo
  const { syncAll } = require('../sheets/syncEngine');
  const r = await syncAll();
  if (r.skipped) {
    return safeReply(interaction, { content: `${EMOJI.WARN} Skipped: ${r.skipped}` }, { dismissible: true });
  }
  const okTabs = r.results.map(x => x.tab);
  const summary = `**Sync completo** em ${r.ms}ms — ${r.results.length} tabs OK, ${r.errors.length} erros`;
  const okLine = okTabs.length ? `${EMOJI.OK} OK (${okTabs.length}): ${okTabs.join(', ')}` : '';
  const errLines = r.errors.length
    ? ['', `${EMOJI.ERRO} Erros (${r.errors.length}):`, ...r.errors.map(e => `• **${e.tab}**: ${e.message}`)]
    : [];
  const msg = [summary, okLine, ...errLines].filter(Boolean).join('\n');
  return safeReply(interaction, { content: msg.slice(0, 1990) }, { dismissible: true });
}

module.exports = { handle };
