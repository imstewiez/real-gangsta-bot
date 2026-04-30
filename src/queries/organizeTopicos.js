'use strict';
/**
 * /organize-topicos — limpa e reorganiza as categorias de tópicos bairristas.
 *
 * 3 acções consolidadas num só comando (preview antes de executar):
 *
 *   1. MOVE ÓRFÃOS — canais em resident_channels.status='active' cuja parentId
 *      não está em {BAIRRISTA_TOPICOS_CATEGORY_ID, ...OVERFLOW_CATEGORY_IDS}.
 *      Caíram fora por setParent manual, reorganização à mão, etc.
 *      → setParent(primary) com fallback para overflow se primary cheia.
 *
 *   2. APAGA LOG-BAIRRISTAS — canais em categorias geridas cujo nome
 *      normalizado inclui 'logbairristas' (bug histórico do bairristaNotifier
 *      criou duplicados com nome em bold unicode; fix em `932a70a`).
 *      → channel.delete. O canal NÃO é necessário (fix de bairristaNotifier
 *      já o confirma: só usa se existir, nunca auto-cria).
 *
 *   3. APAGA SEPARADORES — canais em categorias geridas cujo nome é "visual
 *      separator" (maioritariamente dashes/unicode/symbols, com texto
 *      opcional no meio). Exemplos: "----- topicos -----", "━━━ TÓPICOS ━━━",
 *      "═════════". Criados manualmente para "dividir" visualmente, gastam
 *      slot no limite de 50. → channel.delete.
 *
 * Chefia-only. Dry-run por default. Idempotente — re-correr não duplica.
 */

const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { queueChannelOp } = require('../discordQueue');
const { moveChannelToManagedCategory, getManagedCategoryIds } = require('../members/createResidentChannel');

function _normalized(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function _isLogBairristas(name) {
  return /logbairristas/.test(_normalized(name));
}

// Separador = nome começa E termina com 3+ chars de separator class. Apanha:
//   "----- topicos -----"     → dashes + texto + dashes ✓
//   "━━━━ TÓPICOS ━━━━"       → unicode box + texto + unicode box ✓
//   "══════════"              → só separator chars ✓
// Não apanha:
//   "🍼・YB - Nick"           → começa com emoji
//   "canal-do-guy"            → começa com letra
const SEP_CLASS = '[\\s\\-_━─═╬│・┃┈┉┄┅*=]';
const SEP_RE = new RegExp(`^${SEP_CLASS}{3,}.*${SEP_CLASS}{3,}$|^${SEP_CLASS}{3,}$`);
function _isSeparator(name) {
  return SEP_RE.test(String(name || '').trim());
}

async function _scanState(guild) {
  const managed = await getManagedCategoryIds();

  // 1. Órfãos — resident_channels.active com parentId fora de managed
  const active = await query(
    `SELECT rc.channel_id, rc.channel_name, m.display_name
       FROM resident_channels rc
       JOIN members m ON m.id = rc.member_id
      WHERE rc.status = 'active'`
  );
  const orphans = [];
  for (const r of active.rows) {
    const ch = await guild.channels.fetch(r.channel_id).catch(() => null);
    if (!ch) continue;
    if (!managed.includes(ch.parentId)) {
      orphans.push({
        channelId: r.channel_id,
        channelName: r.channel_name,
        memberName: r.display_name,
        currentParentName: ch.parent?.name || '(sem categoria)',
      });
    }
  }

  // 2/3. Scan managed categories for junk (log-bairristas + separadores)
  const logDups = [];
  const separators = [];
  const countsByCategory = {};
  for (const catId of managed) {
    const cat = await guild.channels.fetch(catId).catch(() => null);
    if (!cat) continue;
    const children = cat.children?.cache || new Map();
    countsByCategory[catId] = { name: cat.name, count: children.size };
    for (const [id, ch] of children) {
      if (_isLogBairristas(ch.name)) {
        logDups.push({ id, name: ch.name, categoryName: cat.name });
      } else if (_isSeparator(ch.name)) {
        separators.push({ id, name: ch.name, categoryName: cat.name });
      }
    }
  }

  return { managed, orphans, logDups, separators, countsByCategory };
}

async function _moveOrphan(guild, orphan) {
  const ch = await guild.channels.fetch(orphan.channelId).catch(() => null);
  if (!ch) throw new Error('canal não existe em Discord');
  // moveChannelToManagedCategory tenta todas as categorias conhecidas com
  // fallback por "cheia", e AUTO-CRIA nova overflow se necessário.
  const { categoryId } = await moveChannelToManagedCategory(guild, ch);
  await query('UPDATE resident_channels SET category_id = $1 WHERE channel_id = $2', [categoryId, orphan.channelId]);
  return { toCategoryId: categoryId };
}

async function _deleteChannel(guild, target, reason) {
  const ch = await guild.channels.fetch(target.id).catch(() => null);
  if (!ch) return { skipped: 'não existe' };
  await queueChannelOp(() => ch.delete(reason));
  // Se aparecer em resident_channels, marca como deleted também.
  await query(
    `UPDATE resident_channels SET status = 'deleted', deleted_at = NOW()
      WHERE channel_id = $1 AND status = 'active'`,
    [target.id]
  ).catch(() => {});
  return { deleted: true };
}

async function handle(interaction) {
  try {
    return await _handleInner(interaction);
  } catch (e) {
    warn(`[ORGANIZE-TOPICOS] Erro em handler: ${e.message}\n${e.stack}`);
    const msg = `${EMOJI.ERRO} Falha: ${String(e.message).slice(0, 200)}`;
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: msg }).catch(() => {});
    }
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function _handleInner(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('organize de tópicos'), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  if (!CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} \`BAIRRISTA_TOPICOS_CATEGORY_ID\` não configurado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const executar = interaction.options.getBoolean('executar') === true;
  const guild = interaction.guild;
  const state = await _scanState(guild);

  const { orphans, logDups, separators, managed, countsByCategory } = state;

  if (!orphans.length && !logDups.length && !separators.length) {
    const embed = brandEmbed('MOVEMENT')
      .setColor(COLOR.SUCCESS)
      .setTitle(`${EMOJI.OK} Tudo organizado`)
      .setDescription(
        `Zero órfãos · Zero log-bairristas · Zero separadores.\n\n${_formatCategoriesStatus(countsByCategory)}`
      );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  }

  if (!executar) {
    return safeReply(interaction, { embeds: [_previewEmbed(state)] }, { messageClass: 'BANAL' });
  }

  // Execução real.
  const started = Date.now();
  const moved = [];
  const deleted = [];
  const failed = [];

  // Ordem: apaga junk primeiro (liberta slots) → depois move órfãos para primary.
  for (const d of logDups) {
    try {
      const r = await _deleteChannel(guild, d, 'organize-topicos: log-bairristas duplicado');
      if (r.deleted) deleted.push({ ...d, kind: 'log-bairristas' });
      log(`[ORGANIZE-TOPICOS] deleted log-bairristas ${d.id} (${d.name})`);
    } catch (e) {
      failed.push({ ...d, kind: 'log-bairristas', error: e.message });
    }
  }
  for (const s of separators) {
    try {
      const r = await _deleteChannel(guild, s, 'organize-topicos: separador visual');
      if (r.deleted) deleted.push({ ...s, kind: 'separador' });
      log(`[ORGANIZE-TOPICOS] deleted separador ${s.id} (${s.name})`);
    } catch (e) {
      failed.push({ ...s, kind: 'separador', error: e.message });
    }
  }
  for (const o of orphans) {
    try {
      const r = await _moveOrphan(guild, o);
      moved.push({ ...o, toCategoryId: r.toCategoryId });
      log(`[ORGANIZE-TOPICOS] moved ${o.channelId} (${o.memberName}) → ${r.toCategoryId}`);
    } catch (e) {
      failed.push({ ...o, kind: 'orphan', error: e.message });
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  return safeReply(
    interaction,
    { embeds: [_executeEmbed(moved, deleted, failed, elapsed)] },
    { messageClass: 'BANAL' }
  );
}

function _formatCategoriesStatus(counts) {
  const lines = ['**Categorias geridas:**'];
  for (const [id, { name, count }] of Object.entries(counts)) {
    const emoji = count >= 49 ? EMOJI.WARN : EMOJI.OK;
    lines.push(`${emoji} **${name}** · ${count}/50 canais`);
  }
  return lines.join('\n');
}

function _previewEmbed(state) {
  const { orphans, logDups, separators, countsByCategory } = state;
  const sections = [];
  sections.push(_formatCategoriesStatus(countsByCategory));

  if (logDups.length) {
    const lines = logDups.slice(0, 20).map(d => `• **${d.name}** em _${d.categoryName}_ · <#${d.id}>`);
    if (logDups.length > 20) lines.push(`_… e mais ${logDups.length - 20}_`);
    sections.push(`\n**${EMOJI.ERRO} ${logDups.length} log-bairristas para apagar:**\n${lines.join('\n')}`);
  }
  if (separators.length) {
    const lines = separators.slice(0, 20).map(s => `• \`${s.name}\` em _${s.categoryName}_ · <#${s.id}>`);
    if (separators.length > 20) lines.push(`_… e mais ${separators.length - 20}_`);
    sections.push(`\n**${EMOJI.ERRO} ${separators.length} separador(es) para apagar:**\n${lines.join('\n')}`);
  }
  if (orphans.length) {
    const lines = orphans
      .slice(0, 20)
      .map(o => `• **${o.memberName}** · <#${o.channelId}> · actualmente em _${o.currentParentName}_`);
    if (orphans.length > 20) lines.push(`_… e mais ${orphans.length - 20}_`);
    sections.push(`\n**${EMOJI.WARN} ${orphans.length} órfão(s) para mover:**\n${lines.join('\n')}`);
  }

  return brandEmbed('MOVEMENT')
    .setColor(COLOR.WARNING_SOFT)
    .setTitle(`${EMOJI.WARN} Organização de tópicos — preview`)
    .setDescription(sections.join('\n').slice(0, 3900))
    .setFooter({ text: 'preview — corre com `executar:true` para aplicar' });
}

function _executeEmbed(moved, deleted, failed, elapsed) {
  const lines = [];
  for (const m of moved) {
    lines.push(`${EMOJI.OK} **${m.memberName}** movido → <#${m.toCategoryId}>`);
  }
  for (const d of deleted) {
    lines.push(`${EMOJI.OK} apagado \`${d.name}\` _(${d.kind})_`);
  }
  for (const f of failed) {
    lines.push(
      `${EMOJI.ERRO} **${f.memberName || f.name}** _(${f.kind || 'unknown'})_ · ${String(f.error).slice(0, 100)}`
    );
  }
  const color = failed.length ? COLOR.DANGER : COLOR.SUCCESS;
  return brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(
      `${EMOJI.REFRESH} Organize tópicos — ${moved.length} movidos · ${deleted.length} apagados · ${failed.length} falhas · ${elapsed}s`
    )
    .setDescription(lines.join('\n').slice(0, 3900));
}

module.exports = { handle };
