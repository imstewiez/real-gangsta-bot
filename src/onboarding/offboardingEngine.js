'use strict';
/**
 * Offboarding — quando um membro sai do servidor.
 *
 * Acções:
 *   1. Procura o registo na DB via discord_id
 *   2. Se for morador e tem canal individual:
 *       - DELETE_ON_LEAVE=true (default) → apaga canal
 *       - ARCHIVE_ON_LEAVE=true         → move para arquivo (mantém)
 *   3. Marca members.status = 'inativo' + resident_channels.status
 *   4. Publica embed no audit channel
 *   5. Loga em audit_logs
 */

const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { query } = require('../db');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');

async function handleMemberLeave(guildMember, client) {
  const discordId = guildMember.id;
  const displayName = guildMember.displayName || guildMember.user?.username || discordId;

  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) {
    // Não era bairrista registado — nothing to do.
    log(`[OFFBOARDING] ${displayName} (${discordId}) saiu mas não estava registado.`);
    return { action: 'noop', reason: 'not_registered' };
  }

  const wasBairrista = dbMember.role === 'bairrista' || dbMember.role === 'morador';
  const channelId = dbMember.channel_id;
  let channelAction = 'none';

  if (wasBairrista && channelId) {
    const guild = guildMember.guild;
    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel) {
        if (CONFIG.DELETE_ON_LEAVE) {
          await queueChannelOp(() => channel.delete(`Morador ${displayName} saiu do servidor`));
          await query(
            `UPDATE resident_channels SET status = 'deleted', deleted_at = NOW()
              WHERE channel_id = $1 AND status = 'active'`,
            [channelId]
          );
          channelAction = 'deleted';
          log(`[OFFBOARDING] Canal de ${displayName} apagado.`);
        } else if (CONFIG.ARCHIVE_ON_LEAVE && CONFIG.MORADOR_ARQUIVO_CATEGORY_ID) {
          await queueChannelOp(() => channel.setParent(CONFIG.MORADOR_ARQUIVO_CATEGORY_ID, { lockPermissions: true }));
          await queueChannelOp(() => channel.send({ content: `🪦 **${displayName}** saiu do servidor — canal arquivado.` }).catch(() => {}));
          await query(
            `UPDATE resident_channels SET status = 'archived', archived_at = NOW()
              WHERE channel_id = $1 AND status = 'active'`,
            [channelId]
          );
          channelAction = 'archived';
          log(`[OFFBOARDING] Canal de ${displayName} arquivado.`);
        }
      }
    } catch (e) {
      warn(`[OFFBOARDING] Falha ao tratar canal ${channelId} de ${displayName}: ${e.message}`);
    }
  }

  // Marca member como inactivo + limpa channel_id
  await memberRepo.update(dbMember.id, { status: 'inativo', channel_id: null });

  await logAudit({
    action: 'member_left',
    entityType: 'member',
    entityId: discordId,
    actorId: 'system:offboarding',
    beforeState: { role: dbMember.role, tier: dbMember.tier, channelId },
    afterState: { status: 'inativo', channelAction },
    context: `${displayName} saiu do servidor — canal ${channelAction}`,
  });

  await sendAuditToChannel(client, {
    title: '🚪 Morador saiu',
    description: `**${displayName}** (<@${discordId}>) saiu do servidor.\n`
      + (channelAction === 'deleted' ? '🗑️ Canal individual apagado.' :
         channelAction === 'archived' ? '📦 Canal individual arquivado.' :
         '_(sem canal associado)_'),
    color: 0x95A5A6,
  }).catch(() => {});

  return { action: 'offboarded', channelAction, wasBairrista, wasMorador: wasBairrista };
}

module.exports = { handleMemberLeave };
