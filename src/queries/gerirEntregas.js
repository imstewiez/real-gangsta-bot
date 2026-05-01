'use strict';
const { MessageFlags, EmbedBuilder } = require('discord.js');
const { inventoryRepo, memberRepo } = require('../repositories');
const { requirePermission } = require('../shared/requirePermission');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { logAudit } = require('../audit/auditEngine');
const eventBus = require('../core/eventBus');

const MOVEMENT_LABELS = {
  entrega_bairrista: '📥 Entrega',
  venda_bairrista: '💰 Venda',
  entrega_oficial: '📥 Entrega (Oficial)',
};

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'listar') return handleListar(interaction);
  if (sub === 'apagar') return handleApagar(interaction);
  return safeReply(interaction, { content: '❌ Subcomando desconhecido.', flags: MessageFlags.Ephemeral });
}

async function handleListar(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;

  const memberOpt = interaction.options.getUser('membro');
  const dias = interaction.options.getInteger('dias') || 7;
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - dias);

  let memberId = null;
  if (memberOpt) {
    const m = await memberRepo.findByDiscordId(memberOpt.id);
    if (!m) return safeReply(interaction, { content: '❌ Membro não encontrado.', flags: MessageFlags.Ephemeral });
    memberId = m.id;
  }

  const subs = await inventoryRepo.getRecentSubmissions({
    limit: 25,
    memberId,
    dateFrom,
  });

  if (!subs.length) {
    return safeReply(interaction, { content: '📭 Nenhuma entrega/venda encontrada.', flags: MessageFlags.Ephemeral });
  }

  const embed = new EmbedBuilder()
    .setTitle(`${EMOJI.ENTREGA} Entregas / Vendas — últimos ${dias} dias`)
    .setColor(0x3498db);

  const lines = subs.map(s => {
    const tipo = MOVEMENT_LABELS[s.movement_type] || s.movement_type;
    const data = new Date(s.created_at).toLocaleDateString('pt-PT');
    return `\`${s.submission_id.slice(0, 8)}\` · **${s.member_name}** · ${tipo} · ${s.total_qty} un · ${data}`;
  });

  embed.setDescription(lines.join('\n').slice(0, 4000));

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleApagar(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;

  const submissionId = interaction.options.getString('submission_id');
  if (!submissionId) {
    return safeReply(interaction, { content: '❌ ID da submission em falta.', flags: MessageFlags.Ephemeral });
  }

  const movements = await inventoryRepo.getSubmissionMovements(submissionId);
  if (!movements.length) {
    return safeReply(interaction, { content: '❌ Submission não encontrada.', flags: MessageFlags.Ephemeral });
  }

  // Compensating movements: reverse each movement to preserve stock integrity
  const { queryWithTransaction } = require('../db');
  const deletedCount = await queryWithTransaction(async client => {
    // Insert compensating movements first
    for (const m of movements) {
      const compensatingQty = -m.quantity;
      const compensatingType = 'ajuste_manual';
      await client.query(
        `INSERT INTO inventory_movements
         (movement_type, item_id, quantity, member_id, member_role, origin, destination, context, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          compensatingType,
          m.item_id,
          compensatingQty,
          m.member_id,
          m.member_role,
          m.destination,
          m.origin,
          `compensação após eliminação de submission ${submissionId}`,
          `Compensação: ${m.movement_type} de ${Math.abs(m.quantity)}x ${m.item_name || 'item'}`,
          interaction.user.tag,
        ]
      );
    }

    // Hard delete original submission
    const res = await client.query(
      'DELETE FROM inventory_movements WHERE submission_id = $1',
      [submissionId]
    );
    return res.rowCount;
  });

  await logAudit({
    action: 'admin_delete_submission',
    entityType: 'inventory',
    entityId: submissionId,
    actorId: interaction.user.tag,
    afterState: {
      deletedCount,
      movements: movements.map(m => ({
        item: m.item_name,
        qty: m.quantity,
        type: m.movement_type,
      })),
    },
  });

  eventBus
    .emitAsync('material.adjusted', {
      reason: 'admin_delete_submission',
      submissionId,
      actorId: interaction.user.tag,
      at: new Date(),
    })
    .catch(() => {});

  return safeReply(
    interaction,
    {
      content: `${EMOJI.OK} Submission \`${submissionId.slice(0, 8)}\` eliminada. ${deletedCount} movimentos apagados + compensações inseridas.`,
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL' }
  );
}

module.exports = { handle };
