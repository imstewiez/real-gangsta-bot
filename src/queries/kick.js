'use strict';

const { MessageFlags } = require('discord.js');
const { isPatraoDiZona, getExactRole } = require('../permissions/permissionEngine');
const { memberRepo } = require('../repositories');
const { query } = require('../db');
const { logAudit } = require('../audit/auditEngine');
const { safeReply } = require('../shared/interactionHelpers');

const ROLE_RANK = {
  young_blood: 1,
  o_gunao: 2,
  gangster_fodido: 3,
  patrao_di_zona: 4,
  real_gangster: 5,
  og: 6,
  kingpin: 7,
  manda_chuva: 8,
};

function rank(role) {
  return ROLE_RANK[role] ?? 0;
}

async function handle(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      { content: 'Sem permissão para expulsar membros.', flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getMember('membro');
  const reason = interaction.options.getString('motivo') || 'Expulso pela chefia';
  if (!target || !target.user) {
    return safeReply(interaction, { content: 'Membro inválido.' }, { messageClass: 'BANAL' });
  }
  if (target.id === interaction.user.id) {
    return safeReply(interaction, { content: 'Não podes expulsar-te a ti próprio.' }, { messageClass: 'BANAL' });
  }

  const actorRole = getExactRole(interaction.member);
  const targetRole = getExactRole(target);
  if (rank(actorRole) <= rank(targetRole)) {
    return safeReply(
      interaction,
      { content: 'Não podes expulsar alguém do mesmo cargo ou superior ao teu.' },
      { messageClass: 'BANAL' }
    );
  }

  const dbMember = await memberRepo.findByDiscordId(target.id);
  if (dbMember) {
    await memberRepo.update(dbMember.id, {
      role: 'inativo',
      status: 'inativo',
      lifecycle_state: 'removed',
      lifecycle_changed_at: new Date(),
      lifecycle_changed_by: interaction.user.id,
      lifecycle_notes: reason,
      deleted_at: new Date(),
      channel_id: null,
    });

    await query(
      `update resident_channels
          set status = 'deleted', deleted_at = now()
        where member_id = $1 and status = 'active'`,
      [dbMember.id]
    ).catch(() => {});
  }

  await target.kick(reason);

  await logAudit({
    action: 'member_kicked',
    entityType: 'member',
    entityId: target.id,
    actorId: interaction.user.id,
    actorName: interaction.user.username,
    beforeState: dbMember ? { role: dbMember.role, tier: dbMember.tier } : null,
    afterState: { status: 'inativo', reason },
    context: `Kick via /kick: ${reason}`,
  });

  return safeReply(
    interaction,
    { content: `Membro expulso: ${target.user.tag}` },
    { messageClass: 'BANAL' }
  );
}

module.exports = { handle };
