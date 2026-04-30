'use strict';
/**
 * /cleanup-topicos — move tópicos "zombie" para archive, libertando slots.
 *
 * Motivação: Discord tem limite de 50 canais por categoria. Quando o
 * BAIRRISTA_TOPICOS_CATEGORY_ID atinge esse limite, novos onboardings
 * e `/backfill-topicos` falham. Este comando limpa:
 *   - Canais cujo owner (via resident_channels) já NÃO é bairrista activo
 *     (foi promovido a oficial, saiu da org, ou está soft-deleted em DB)
 *
 * Acção por canal zombie: mover para BAIRRISTA_ARQUIVO_CATEGORY_ID via
 * channel.setParent + UPDATE resident_channels SET status='archived'.
 *
 * Chefia-only. Dry-run por omissão — vê quem vai mover antes de executar.
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

async function _findZombies() {
  // Canais em resident_channels com status='active' cujo member NÃO é bairrista
  // activo. Indica: foi promovido, saiu, ou row foi soft-deleted sem cleanup.
  const res = await query(
    `SELECT rc.channel_id, rc.channel_name, rc.discord_id,
            m.id AS member_id, m.display_name, m.role, m.status, m.deleted_at
       FROM resident_channels rc
       JOIN members m ON m.id = rc.member_id
      WHERE rc.status = 'active'
        AND (
          m.role != 'bairrista'
          OR m.status != 'ativo'
          OR m.deleted_at IS NOT NULL
        )
      ORDER BY m.display_name ASC`
  );
  return res.rows;
}

async function _archiveOne(guild, zombie) {
  const channel = await guild.channels.fetch(zombie.channel_id).catch(() => null);
  if (!channel) {
    // Canal já não existe em Discord — apenas marca em DB.
    await query(
      `UPDATE resident_channels SET status = 'deleted', deleted_at = NOW()
        WHERE channel_id = $1 AND status = 'active'`,
      [zombie.channel_id]
    );
    return { action: 'db-only', channelId: zombie.channel_id };
  }

  if (CONFIG.BAIRRISTA_ARQUIVO_CATEGORY_ID) {
    await queueChannelOp(() => channel.setParent(CONFIG.BAIRRISTA_ARQUIVO_CATEGORY_ID, { lockPermissions: true }));
    await query(
      `UPDATE resident_channels SET status = 'archived', archived_at = NOW()
        WHERE channel_id = $1 AND status = 'active'`,
      [zombie.channel_id]
    );
    return { action: 'archived', channelId: zombie.channel_id };
  }

  // Sem archive configurado — marca em DB mas não mexe em Discord.
  await query(
    `UPDATE resident_channels SET status = 'archived', archived_at = NOW()
      WHERE channel_id = $1 AND status = 'active'`,
    [zombie.channel_id]
  );
  return { action: 'db-only-no-archive-cat', channelId: zombie.channel_id };
}

async function handle(interaction) {
  try {
    return await _handleInner(interaction);
  } catch (e) {
    warn(`[CLEANUP-TOPICOS] Erro em handler: ${e.message}\n${e.stack}`);
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
      { content: ERRORS.NO_PERMISSION('cleanup de tópicos'), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const executar = interaction.options.getBoolean('executar') === true;
  const zombies = await _findZombies();

  if (!zombies.length) {
    const embed = brandEmbed('MOVEMENT')
      .setColor(COLOR.SUCCESS)
      .setTitle(`${EMOJI.OK} Zero zombies`)
      .setDescription('Todos os tópicos activos têm um bairrista activo. Nada a limpar.');
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  }

  if (!executar) {
    const lines = zombies.slice(0, 40).map(z => {
      const reason = z.deleted_at
        ? 'soft-deleted'
        : z.role !== 'bairrista'
          ? `promovido → ${z.role}`
          : `status=${z.status}`;
      return `• **${z.display_name}** · ${reason} · <#${z.channel_id}>`;
    });
    if (zombies.length > 40) lines.push(`_… e mais ${zombies.length - 40}_`);

    const archiveHint = CONFIG.BAIRRISTA_ARQUIVO_CATEGORY_ID
      ? '→ mover para arquivo'
      : '⚠ sem `BAIRRISTA_ARQUIVO_CATEGORY_ID` configurado — só marca em DB';

    const embed = brandEmbed('MOVEMENT')
      .setColor(COLOR.WARNING_SOFT)
      .setTitle(`${EMOJI.WARN} ${zombies.length} tópico(s) zombie — ${archiveHint}`)
      .setDescription(lines.join('\n').slice(0, 3900))
      .setFooter({ text: 'preview — corre com `executar:true` para arquivar' });
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'WARN' });
  }

  const guild = interaction.guild;
  const started = Date.now();
  const archived = [];
  const failed = [];

  for (const z of zombies) {
    try {
      const r = await _archiveOne(guild, z);
      archived.push({ zombie: z, ...r });
      log(`[CLEANUP-TOPICOS] ${z.display_name} → ${r.action} (${r.channelId}).`);
    } catch (e) {
      failed.push({ zombie: z, error: e.message });
      warn(`[CLEANUP-TOPICOS] ${z.display_name} falhou: ${e.message}`);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const lines = [];
  for (const a of archived) {
    lines.push(`${EMOJI.OK} **${a.zombie.display_name}** · ${a.action}`);
  }
  for (const f of failed) {
    lines.push(`${EMOJI.ERRO} **${f.zombie.display_name}** · ${String(f.error).slice(0, 120)}`);
  }

  const color = failed.length ? COLOR.DANGER : COLOR.SUCCESS;
  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(
      `${EMOJI.REFRESH} Cleanup de tópicos — ${archived.length} arquivados · ${failed.length} falhas · ${elapsed}s`
    )
    .setDescription(lines.join('\n').slice(0, 3900))
    .setFooter({ text: 'Slots libertados — podes agora correr `/backfill-topicos executar:true`' });

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = { handle };
