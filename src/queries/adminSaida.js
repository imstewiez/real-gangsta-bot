'use strict';
const { MessageFlags, EmbedBuilder } = require('discord.js');
const { saidaRepo, memberRepo } = require('../repositories');
const { requirePermission } = require('../shared/requirePermission');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { logAudit } = require('../audit/auditEngine');
const eventBus = require('../core/eventBus');
const { queryWithTransaction } = require('../db');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'delete') return handleDelete(interaction);
  return safeReply(interaction, { content: '❌ Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
}

async function handleDelete(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;

  const saidaId = interaction.options.getInteger('id');
  if (!saidaId) {
    return safeReply(interaction, { content: '❌ ID da saída em falta.', flags: MessageFlags.Ephemeral });
  }

  const saida = await saidaRepo.findById(saidaId);
  if (!saida) {
    return safeReply(interaction, { content: '❌ Saída não encontrada.', flags: MessageFlags.Ephemeral });
  }

  // Cascade delete in transaction
  let deletedRows = 0;
  try {
    deletedRows = await queryWithTransaction(async client => {
      // 1. Delete inventory movements linked to this saida
      await client.query('DELETE FROM inventory_movements WHERE saida_id = $1', [saidaId]);

      // 2. Delete kill logs linked to this saida
      await client.query('DELETE FROM kill_logs WHERE saida_id = $1', [saidaId]);

      // 3. Delete operation_materials (cascade FK handles this, but explicit is safer)
      await client.query('DELETE FROM operation_materials WHERE operation_id = $1', [saidaId]);

      // 4. Delete operation_participants (cascade FK handles this)
      await client.query('DELETE FROM operation_participants WHERE operation_id = $1', [saidaId]);

      // 5. Delete audit logs referencing this saida
      await client.query("DELETE FROM audit_logs WHERE entity_type = 'saida' AND entity_id = $1", [String(saidaId)]);

      // 6. Delete the operation itself
      const res = await client.query('DELETE FROM operations WHERE id = $1 RETURNING *', [saidaId]);
      return res.rowCount;
    });
  } catch (e) {
    return safeReply(interaction, { content: `❌ Erro ao eliminar saída: ${e.message}`, flags: MessageFlags.Ephemeral });
  }

  await logAudit({
    action: 'admin_delete_saida',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.tag,
    afterState: {
      deletedRows,
      saidaDate: saida.date,
      saidaSpot: saida.spot,
      saidaType: saida.operation_type,
    },
  });

  eventBus
    .emitAsync('saida.deleted', {
      saidaId,
      actorId: interaction.user.tag,
      at: new Date(),
    })
    .catch(() => {});

  return safeReply(
    interaction,
    {
      content: `${EMOJI.OK} Saída **#${saidaId}** eliminada. Cascade completo (kills, materiais, participantes, audit).`,
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL' }
  );
}

module.exports = { handle };
