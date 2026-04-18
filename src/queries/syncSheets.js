'use strict';
/**
 * Slash handler para /sync-sheets.
 * Chefia-only. Força `syncEngine.syncAll()` e reporta por tab.
 *
 * Usado quando:
 *   - Sheet mostra stale data (ex: items desaparecidos do breakdown)
 *   - Após migration que invalidou queries
 *   - Diagnóstico rápido ("é stale ou bug real?")
 *
 * Sem argumentos — sincroniza TODAS as tabs (stock, dashboard, membros,
 * saidas, resumo, config).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const CONFIG = require('../config');
const { isChefia } = require('../permissions/permissionEngine');

async function handle(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('forçar sync de sheets'),
        flags: MessageFlags.Ephemeral,
      },
      { dismissible: true }
    );
  }

  if (!CONFIG.isSheetsEnabled || !CONFIG.isSheetsEnabled()) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Google Sheets desactivado — define \`GOOGLE_SERVICE_ACCOUNT_JSON\` e \`SPREADSHEET_ID\` no Railway.`,
        flags: MessageFlags.Ephemeral,
      },
      { dismissible: true }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const started = Date.now();
  const { syncAll } = require('../sheets/syncEngine');
  let results;
  try {
    results = await syncAll();
  } catch (e) {
    return safeReply(interaction, { content: ERRORS.WITH_DETAIL(`Sync falhou: ${e.message}`) }, { dismissible: true });
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const ok = results.filter(r => !r.error && !r.skipped);
  const skipped = results.filter(r => r.skipped);
  const errored = results.filter(r => r.error);

  const lines = [];
  for (const r of ok) {
    lines.push(`${EMOJI.OK} **${r.tab}** · ${r.ops || 0} ops · ${r.ms || 0}ms`);
  }
  for (const r of skipped) {
    lines.push(`${EMOJI.INFO} **${r.tab}** · skip _(${r.skipped})_`);
  }
  for (const r of errored) {
    lines.push(`${EMOJI.ERRO} **${r.tab}** · ${String(r.error).slice(0, 100)}`);
  }

  const color = errored.length ? 0xe74c3c : ok.length ? 0x2ecc71 : 0xf39c12;
  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(`${EMOJI.REFRESH} Sync de Sheets — ${ok.length}/${results.length} ok · ${elapsed}s`)
    .setDescription(lines.join('\n').slice(0, 3900));

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handle };
