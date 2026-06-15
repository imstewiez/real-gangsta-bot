'use strict';

const { MessageFlags } = require('discord.js');
const { canKickTarget, isPatraoDiZona } = require('../permissions/permissionEngine');
const { memberRepo } = require('../repositories');
const { query } = require('../db');
const { logAudit } = require('../audit/auditEngine');
const { safeReply } = require('../shared/interactionHelpers');

async function handle(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getMember('membro');
  const reason = interaction.options.getString('motivo') || 'Remoção controlada via comando de gestão';

  if (!target || !target.user) {
    return safeReply(interaction, { content: 'Membro inválido.' }, { messageClass: 'BANAL' });
  }
  if (target.id === interaction.user.id) {
    return safeReply(interaction, { content: 'Não podes remover-te a ti próprio.' }, { messageClass: 'BANAL' });
  }

  if (!canKickTarget(interaction.member, target)) {
    const content = isPatraoDiZona(interaction.member)
      ? 'Patrão Di Zona só pode remover membros dos níveis operacionais autorizados.'
      : 'Não tens permissão para remover este membro.';
    return safeReply(interaction, { content }, { messageClass: 'BANAL' });
  }

  const dbMember = await memberRepo.findByDiscordId(target.id);
  if (dbMember) {
    await query(
      `update members
          set status = 'inativo',
              lifecycle_state = 'removed',
              lifecycle_changed_at = now(),
              lifecycle_changed_by = $2,
              lifecycle_notes = $3,
              deleted_at = now(),
              updated_at = now()
        where id = $1`,
      [dbMember.id, interaction.user.id, reason]
    );

    await query(
      `update resident_channels
          set status = 'archived', deleted_at = now()
        where member_id = $1 and status = 'active'`,
      [dbMember.id]
    ).catch(() => {});
  }

  await target['kick'](reason);

  await logAudit({
    action: 'member_removed',
    entityType: 'member',
    entityId: target.id,
    actorId: interaction.user.id,
    actorName: interaction.user.username,
    beforeState: dbMember ? { role: dbMember.role, tier: dbMember.tier, status: dbMember.status } : null,
    afterState: { status: 'inativo', lifecycle_state: 'removed', reason },
    context: `Remoção via comando de gestão: ${reason}`,
  });

  return safeReply(interaction, { content: `Membro removido: ${target.user.tag}` }, { messageClass: 'BANAL' });
}

module.exports = { handle };
