'use strict';
/**
 * Slash handler para /sync-sheets — diagnóstico e resync manual, chefia-only.
 *
 * Acções:
 *   - status (default): tabela com last_synced_at, last_result, consecutive_errors
 *     por tab. Usar primeiro quando há suspeita de "sheet está stale" — diz se
 *     o sync corre, quando correu pela última vez, e se falhou.
 *   - all: força `syncEngine.syncAll()`. Único caminho seguro para recuperar uma
 *     tab apagada manualmente ou após migration que invalidou queries.
 *   - tab: força `syncEngine.syncOne(tab)`. Pontaria — quando só uma tab está
 *     degradada, não precisa de pagar custo das outras.
 *
 * Não retry aqui — manual = operador está a olhar. Se falhar, operador vê
 * erro e decide o que fazer.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const CONFIG = require('../config');
const { isChefia } = require('../permissions/permissionEngine');

const VALID_TABS = new Set(['dashboard', 'resumo', 'membros', 'saidas', 'stock', 'config']);

function _formatAge(ts) {
  if (!ts) return 'nunca';
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '?';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ` ${h % 24}h` : ''}`;
}

function _resultEmoji(result, consecutiveErrors) {
  if (result === 'ok') return EMOJI.OK;
  if (result === 'error') {
    if (consecutiveErrors >= 3) return EMOJI.ERRO;
    return EMOJI.WARN;
  }
  if (result === 'skipped') return EMOJI.INFO;
  return EMOJI.INFO;
}

async function _statusHandler(interaction) {
  const { getSheetSyncState } = require('../repositories/_meta');
  let rows;
  try {
    rows = await getSheetSyncState();
  } catch (e) {
    return safeReply(
      interaction,
      { content: ERRORS.WITH_DETAIL(`Leitura de estado falhou: ${e.message}`) },
      { messageClass: 'ERROR' }
    );
  }

  const byTab = new Map((rows || []).map(r => [r.tab_key, r]));
  // Ordem canónica das tabs (mesma que TAB_SYNCERS).
  const canonicalOrder = ['dashboard', 'resumo', 'membros', 'saidas', 'stock', 'config'];

  const lines = [];
  let degradedCount = 0;
  for (const tab of canonicalOrder) {
    const r = byTab.get(tab);
    if (!r) {
      lines.push(`${EMOJI.INFO} **${tab}** · nunca sincronizada`);
      continue;
    }
    const emoji = _resultEmoji(r.last_result, r.consecutive_errors || 0);
    if (r.last_result === 'error') degradedCount += 1;
    const age = _formatAge(r.last_synced_at);
    const ops = r.last_ops != null ? `${r.last_ops} ops` : '—';
    const ms = r.last_ms != null ? `${r.last_ms}ms` : '—';
    const extra = [];
    if ((r.consecutive_errors || 0) > 0) extra.push(`⚠ ${r.consecutive_errors}× seguidas`);
    if (r.last_result === 'error' && r.last_error) extra.push(`_${String(r.last_error).slice(0, 200)}_`);
    const tail = extra.length ? ` · ${extra.join(' · ')}` : '';
    lines.push(`${emoji} **${tab}** · ${age} · ${ops} · ${ms}${tail}`);
  }

  const color = degradedCount > 0 ? COLOR.DANGER : COLOR.SUCCESS;
  const title =
    degradedCount > 0
      ? `${EMOJI.WARN} Sync Sheets — ${degradedCount} tab(s) degradada(s)`
      : `${EMOJI.OK} Sync Sheets — todas ok`;

  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(title)
    .setDescription(lines.join('\n').slice(0, 3900))
    .setFooter({ text: 'status é read-only · usa "acao: all" ou "acao: tab" para forçar resync' });

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'RESULT' });
}

async function _resyncAllHandler(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { syncAll } = require('../sheets/syncEngine');
  const started = Date.now();
  let results;
  try {
    results = await syncAll();
  } catch (e) {
    return safeReply(interaction, { content: ERRORS.WITH_DETAIL(`Sync falhou: ${e.message}`) }, { messageClass: 'ERROR' });
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
    lines.push(`${EMOJI.ERRO} **${r.tab}** · ${String(r.error).slice(0, 200)}`);
  }

  const color = errored.length ? COLOR.DANGER : ok.length ? COLOR.SUCCESS : COLOR.WARNING_SOFT;
  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(`${EMOJI.REFRESH} Sync de Sheets — ${ok.length}/${results.length} ok · ${elapsed}s`)
    .setDescription(lines.join('\n').slice(0, 3900));

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'ERROR' });
}

async function _resyncTabHandler(interaction, tab) {
  if (!tab || !VALID_TABS.has(tab)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Preenche a opção \`tab\` (uma de: ${[...VALID_TABS].join(', ')}).`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { syncOne } = require('../sheets/syncEngine');
  const started = Date.now();
  let result;
  try {
    result = await syncOne(tab);
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} **${tab}** · falhou: ${String(e.message).slice(0, 200)}` },
      { messageClass: 'ERROR' }
    );
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (result?.skipped) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} **${tab}** · skip _(${result.skipped})_` },
      { messageClass: 'BANAL' }
    );
  }

  return safeReply(
    interaction,
    {
      content: `${EMOJI.OK} **${tab}** · ${result.ops || 0} ops · ${result.ms || 0}ms · ${elapsed}s total`,
    },
    { messageClass: 'BANAL' }
  );
}

async function handle(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('diagnóstico de sheets'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  if (!CONFIG.isSheetsEnabled || !CONFIG.isSheetsEnabled()) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Google Sheets desactivado — define \`GOOGLE_SERVICE_ACCOUNT_JSON\` e \`SPREADSHEET_ID\` no Railway.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  const acao = interaction.options.getString('acao') || 'status';
  const tab = interaction.options.getString('tab');

  if (acao === 'status') return _statusHandler(interaction);
  if (acao === 'all') return _resyncAllHandler(interaction);
  if (acao === 'tab') return _resyncTabHandler(interaction, tab);

  return safeReply(
    interaction,
    { content: `${EMOJI.WARN} Acção inválida: \`${acao}\`.`, flags: MessageFlags.Ephemeral },
    { messageClass: 'BANAL' }
  );
}

module.exports = { handle };
