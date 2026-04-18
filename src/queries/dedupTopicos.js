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
const { brandEmbed } = require('../shared/embedBuilders');
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

async function _findDuplicates(guild) {
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

  const dups = [];
  for (const r of active.rows) {
    const nick = r.nickname || r.display_name;
    if (_normalized(nick).length < MIN_NICK_LEN) continue;
    const expected = formatResidentChannelName(r.tier || 'young_blood', nick);
    const matches = textChannels.filter(c => _matchesBairrista(c.name, expected, nick));
    if (matches.length < 2) continue;

    // Oldest wins — sort asc por createdTimestamp.
    matches.sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
    const keep = matches[0];
    const toDelete = matches.slice(1);

    dups.push({
      memberName: r.display_name,
      memberId: r.member_id,
      trackedChannelId: r.channel_id,
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
  return dups;
}

async function _resolveOne(guild, dup) {
  const actions = { deleted: 0, deleteFails: [], trackingUpdated: false, movedTo: null, moveFailed: null };

  // 1. Apaga os mais recentes.
  for (const toDel of dup.toDelete) {
    try {
      const ch = await guild.channels.fetch(toDel.id).catch(() => null);
      if (!ch) continue; // já não existe
      await queueChannelOp(() => ch.delete(`dedup-topicos: duplicado de ${dup.memberName} (oldest wins)`));
      actions.deleted += 1;
    } catch (e) {
      actions.deleteFails.push({ id: toDel.id, name: toDel.name, error: e.message });
    }
  }

  // 2. Actualiza resident_channels para apontar ao kept.
  if (dup.trackedChannelId !== dup.keep.id) {
    await query(
      `UPDATE resident_channels
          SET channel_id = $1,
              channel_name = $2,
              updated_at = NOW()
        WHERE member_id = $3 AND status = 'active'`,
      [dup.keep.id, dup.keep.name, dup.memberId]
    );
    actions.trackingUpdated = true;
  }

  // 3. Move kept para categoria gerida.
  try {
    const ch = await guild.channels.fetch(dup.keep.id).catch(() => null);
    if (ch) {
      const { categoryId } = await moveChannelToManagedCategory(guild, ch);
      await query(`UPDATE resident_channels SET category_id = $1 WHERE channel_id = $2`, [categoryId, dup.keep.id]);
      actions.movedTo = categoryId;
    }
  } catch (e) {
    actions.moveFailed = e.message;
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
      { dismissible: true }
    );
  }
  if (!CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} \`BAIRRISTA_TOPICOS_CATEGORY_ID\` não configurado.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const executar = interaction.options.getBoolean('executar') === true;
  const guild = interaction.guild;
  const dups = await _findDuplicates(guild);

  if (!dups.length) {
    const embed = brandEmbed('MOVEMENT')
      .setColor(0x2ecc71)
      .setTitle(`${EMOJI.OK} Zero duplicados`)
      .setDescription('Cada bairrista activo tem no máximo um canal.');
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  }

  if (!executar) {
    const lines = dups.slice(0, 20).map(d => {
      const keepDate = (d.keep.createdAt || '').slice(0, 10);
      const delList = d.toDelete.map(x => `<#${x.id}> _(${(x.createdAt || '').slice(0, 10)})_`).join(', ');
      return (
        `• **${d.memberName}** — mantém <#${d.keep.id}> _(${keepDate}, ${d.keep.parentName})_\n` +
        `  → apaga: ${delList}`
      );
    });
    if (dups.length > 20) lines.push(`_… e mais ${dups.length - 20}_`);

    const embed = brandEmbed('MOVEMENT')
      .setColor(0xf39c12)
      .setTitle(`${EMOJI.WARN} ${dups.length} bairrista(s) com duplicados`)
      .setDescription(
        'Oldest wins — mantém o canal mais antigo, apaga os criados depois.\n' +
          'Move o mantido para categoria gerida (BAIRRISTAS ou overflow).\n\n' +
          lines.join('\n').slice(0, 3500)
      )
      .setFooter({ text: 'preview — corre com `executar:true` para aplicar' });
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  }

  const started = Date.now();
  const results = [];
  for (const d of dups) {
    try {
      const r = await _resolveOne(guild, d);
      results.push({ dup: d, ...r });
      log(`[DEDUP-TOPICOS] ${d.memberName}: ${r.deleted} apagados, moved=${r.movedTo || 'falhou'}`);
    } catch (e) {
      results.push({ dup: d, fatal: e.message });
      warn(`[DEDUP-TOPICOS] ${d.memberName} erro fatal: ${e.message}`);
    }
  }

  const totalDeleted = results.reduce((s, r) => s + (r.deleted || 0), 0);
  const totalDeleteFails = results.reduce((s, r) => s + (r.deleteFails?.length || 0), 0);
  const totalMoved = results.filter(r => r.movedTo).length;
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const lines = results.slice(0, 25).map(r => {
    const parts = [];
    if (r.fatal) return `${EMOJI.ERRO} **${r.dup.memberName}** · ${String(r.fatal).slice(0, 100)}`;
    parts.push(`${r.deleted || 0} apagado(s)`);
    if (r.trackingUpdated) parts.push('tracking actualizado');
    if (r.movedTo) parts.push(`movido → <#${r.movedTo}>`);
    if (r.moveFailed) parts.push(`⚠ move falhou: ${String(r.moveFailed).slice(0, 60)}`);
    return `${EMOJI.OK} **${r.dup.memberName}** · ${parts.join(' · ')}`;
  });
  if (results.length > 25) lines.push(`_… e mais ${results.length - 25}_`);

  const color = totalDeleteFails ? 0xe74c3c : 0x2ecc71;
  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(`${EMOJI.REFRESH} Dedup tópicos — ${totalDeleted} apagados · ${totalMoved} movidos · ${elapsed}s`)
    .setDescription(lines.join('\n').slice(0, 3900));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handle };
