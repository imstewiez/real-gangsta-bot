'use strict';
/**
 * /dedup-topicos — resolve duplicados de canais por bairrista.
 *
 * Contexto: backfill-topicos criou canais para bairristas que APARENTEMENTE
 * não tinham (resident_channels não os registava), mas esses canais já
 * existiam em Discord (manuais ou de bot antigo). Ficaram duplicados:
 *   - OLD: canal antigo com histórico, não tracked em resident_channels
 *   - NEW: canal recém-criado pelo backfill, vazio, tracked
 *
 * Política de resolução (oldest wins): para cada bairrista, mantém o canal
 * mais ANTIGO (por createdTimestamp). Apaga os outros. Actualiza
 * resident_channels.channel_id para apontar ao mantido. Move-o para
 * categoria gerida (via moveChannelToManagedCategory — com fallback e
 * auto-create).
 *
 * Matching: normaliza nome do canal (NFKD + strip non-alphanumeric) e
 * compara contra formatResidentChannelName(tier, nickname) normalizado E
 * endsWith(nickname) como fallback se tier mudou (ex: promovido de YB para
 * Gunão — canal antigo ainda tem `yb...` prefix).
 *
 * Chefia-only. Dry-run por default.
 */

const { ChannelType, MessageFlags } = require('discord.js');
const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { queueChannelOp } = require('../discordQueue');
const { formatResidentChannelName } = require('../discord/structureTemplate');
const { moveChannelToManagedCategory } = require('../members/createResidentChannel');

const MIN_NICK_LEN = 3; // Nicknames mais curtos → alto risco de colisão, skip.

function _normalized(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function _matchesBairrista(channelName, expectedName, nickname) {
  const chan = _normalized(channelName);
  const exp = _normalized(expectedName);
  if (chan === exp) return true;
  const nick = _normalized(nickname);
  if (nick.length < MIN_NICK_LEN) return false;
  // Fallback: canal acaba com o nickname normalizado (cobre mudanças de tier
  // onde prefix muda mas nickname no final fica igual).
  return chan.endsWith(nick);
}

async function _findIssues(guild) {
  const active = await query(
    `SELECT rc.channel_id, m.id AS member_id, m.display_name, m.nickname, m.tier
       FROM resident_channels rc
       JOIN members m ON m.id = rc.member_id
      WHERE rc.status = 'active'
        AND m.status = 'ativo'
        AND m.deleted_at IS NULL
        AND m.role = 'bairrista'`
  );

  const textChannels = Array.from(guild.channels.cache.values()).filter(c => c.type === ChannelType.GuildText);

  const issues = [];
  for (const r of active.rows) {
    const nick = r.nickname || r.display_name;
    if (_normalized(nick).length < MIN_NICK_LEN) continue;
    const expected = formatResidentChannelName(r.tier || 'young_blood', nick);
    const matches = textChannels.filter(c => _matchesBairrista(c.name, expected, nick));

    // Fetch the tracked channel — null se foi deleted (recovery case).
    const trackedChannel = await guild.channels.fetch(r.channel_id).catch(() => null);

    const baseInfo = { memberName: r.display_name, memberId: r.member_id, trackedChannelId: r.channel_id };

    if (!trackedChannel && matches.length >= 1) {
      // RECOVERY: tracking aponta a canal apagado mas há matching orfão.
      // Re-link ao mais antigo.
      matches.sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
      const keep = matches[0];
      issues.push({
        type: 'recover',
        ...baseInfo,
        keep: {
          id: keep.id,
          name: keep.name,
          createdAt: keep.createdAt?.toISOString() || '?',
          parentName: keep.parent?.name || '(sem categoria)',
        },
        // extras: se há 2+ matches, também dedupa — mantém oldest, apaga resto.
        toDelete: matches.slice(1).map(c => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt?.toISOString() || '?',
          parentName: c.parent?.name || '(sem categoria)',
        })),
      });
      continue;
    }

    if (trackedChannel && matches.length > 1) {
      // DEDUP: tracked existe mas há múltiplos canais. Oldest wins.
      matches.sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
      const keep = matches[0];
      const toDelete = matches.slice(1);
      issues.push({
        type: 'dedup',
        ...baseInfo,
        keep: {
          id: keep.id,
          name: keep.name,
          createdAt: keep.createdAt?.toISOString() || '?',
          parentName: keep.parent?.name || '(sem categoria)',
        },
        toDelete: toDelete.map(c => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt?.toISOString() || '?',
          parentName: c.parent?.name || '(sem categoria)',
        })),
      });
    }
    // else: tracked existe + 1 match = ok, ou 0 matches = orfão (backfill needed)
  }
  return issues;
}

async function _resolveOne(guild, issue) {
  const actions = { deleted: 0, deleteFails: [], trackingUpdated: false, movedTo: null, moveFailed: null };

  // ORDEM IMPORTA — tracking ANTES de deletes:
  // Se step 1 falhar, step 2 (delete) não corre → nada estragado.
  // Antes era delete→update: se update falhava, canais já estavam deletados
  // mas tracking apontava ao que já não existia.

  // 1. UPDATE resident_channels para apontar ao kept (sem updated_at, coluna
  //    não existe nesta tabela).
  if (issue.trackedChannelId !== issue.keep.id) {
    await query(
      `UPDATE resident_channels
          SET channel_id = $1,
              channel_name = $2
        WHERE member_id = $3 AND status = 'active'`,
      [issue.keep.id, issue.keep.name, issue.memberId]
    );
    actions.trackingUpdated = true;
  }

  // 2. Move kept para categoria gerida.
  try {
    const ch = await guild.channels.fetch(issue.keep.id).catch(() => null);
    if (ch) {
      const { categoryId } = await moveChannelToManagedCategory(guild, ch);
      await query('UPDATE resident_channels SET category_id = $1 WHERE channel_id = $2', [categoryId, issue.keep.id]);
      actions.movedTo = categoryId;
    }
  } catch (e) {
    actions.moveFailed = e.message;
  }

  // 3. Apaga os outros canais (por último — depois de tracking seguro).
  for (const toDel of issue.toDelete) {
    try {
      const ch = await guild.channels.fetch(toDel.id).catch(() => null);
      if (!ch) continue; // já não existe
      await queueChannelOp(() => ch.delete(`dedup-topicos: duplicado de ${issue.memberName} (oldest wins)`));
      actions.deleted += 1;
    } catch (e) {
      actions.deleteFails.push({ id: toDel.id, name: toDel.name, error: e.message });
    }
  }

  return actions;
}

async function handle(interaction) {
  try {
    return await _handleInner(interaction);
  } catch (e) {
    warn(`[DEDUP-TOPICOS] Erro: ${e.message}\n${e.stack}`);
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
      { content: ERRORS.NO_PERMISSION('dedup de tópicos'), flags: MessageFlags.Ephemeral },
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
  const issues = await _findIssues(guild);

  if (!issues.length) {
    const embed = brandEmbed('MOVEMENT')
      .setColor(COLOR.SUCCESS)
      .setTitle(`${EMOJI.OK} Zero problemas`)
      .setDescription('Cada bairrista activo tem tracking correcto e sem duplicados.');
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  }

  const recoverCount = issues.filter(i => i.type === 'recover').length;
  const dedupCount = issues.filter(i => i.type === 'dedup').length;

  if (!executar) {
    const lines = issues.slice(0, 20).map(i => {
      const keepDate = (i.keep.createdAt || '').slice(0, 10);
      const prefix = i.type === 'recover' ? '🩹 RECOVER' : '🔀 DEDUP';
      if (i.toDelete.length) {
        const delList = i.toDelete.map(x => `<#${x.id}> _(${(x.createdAt || '').slice(0, 10)})_`).join(', ');
        return (
          `${prefix} **${i.memberName}** — mantém <#${i.keep.id}> _(${keepDate}, ${i.keep.parentName})_\n` +
          `  → apaga: ${delList}`
        );
      }
      return `${prefix} **${i.memberName}** — re-linka tracking → <#${i.keep.id}> _(${keepDate}, ${i.keep.parentName})_`;
    });
    if (issues.length > 20) lines.push(`_… e mais ${issues.length - 20}_`);

    const embed = brandEmbed('MOVEMENT')
      .setColor(COLOR.WARNING_SOFT)
      .setTitle(`${EMOJI.WARN} ${issues.length} issue(s) — ${recoverCount} recover · ${dedupCount} dedup`)
      .setDescription(
        '🩹 **RECOVER**: tracking aponta a canal apagado — re-linka ao orfão mais antigo.\n' +
          '🔀 **DEDUP**: múltiplos canais existem — oldest wins.\n\n' +
          lines.join('\n').slice(0, 3500)
      )
      .setFooter({ text: 'preview — corre com `executar:true` para aplicar' });
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'WARN' });
  }

  const started = Date.now();
  const results = [];
  for (const i of issues) {
    try {
      const r = await _resolveOne(guild, i);
      results.push({ issue: i, ...r });
      log(`[DEDUP-TOPICOS] ${i.memberName} (${i.type}): ${r.deleted} apagados, moved=${r.movedTo || 'falhou'}`);
    } catch (e) {
      results.push({ issue: i, fatal: e.message });
      warn(`[DEDUP-TOPICOS] ${i.memberName} erro fatal: ${e.message}`);
    }
  }

  const totalDeleted = results.reduce((s, r) => s + (r.deleted || 0), 0);
  const totalDeleteFails = results.reduce((s, r) => s + (r.deleteFails?.length || 0), 0);
  const totalMoved = results.filter(r => r.movedTo).length;
  const totalRecovered = results.filter(r => r.issue?.type === 'recover' && r.trackingUpdated).length;
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const lines = results.slice(0, 25).map(r => {
    const parts = [];
    if (r.fatal) return `${EMOJI.ERRO} **${r.issue.memberName}** · ${String(r.fatal).slice(0, 100)}`;
    if (r.issue.type === 'recover') parts.push('re-linked tracking');
    if (r.deleted) parts.push(`${r.deleted} apagado(s)`);
    if (r.trackingUpdated && r.issue.type !== 'recover') parts.push('tracking actualizado');
    if (r.movedTo) parts.push(`movido → <#${r.movedTo}>`);
    if (r.moveFailed) parts.push(`⚠ move falhou: ${String(r.moveFailed).slice(0, 60)}`);
    return `${EMOJI.OK} **${r.issue.memberName}** · ${parts.join(' · ')}`;
  });
  if (results.length > 25) lines.push(`_… e mais ${results.length - 25}_`);

  const color = totalDeleteFails ? COLOR.DANGER : COLOR.SUCCESS;
  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(
      `${EMOJI.REFRESH} Dedup — ${totalRecovered} recovered · ${totalDeleted} apagados · ${totalMoved} movidos · ${elapsed}s`
    )
    .setDescription(lines.join('\n').slice(0, 3900));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'ERROR' });
}

module.exports = { handle };
