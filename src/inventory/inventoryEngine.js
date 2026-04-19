'use strict';
const crypto = require('crypto');
const { inventoryRepo, memberRepo, bairristaStatsRepo } = require('../repositories');
const { queryWithTransaction } = require('../db');
const { logAudit } = require('../audit/auditEngine');
const { notifyMovement } = require('./stockNotifier');
const { notifyBairristaMovement, notifyBairristaBatch } = require('./bairristaNotifier');
const metrics = require('../lib/metrics');
const { weekBounds } = require('../util');
const { warn, log } = require('../logger');
const eventBus = require('../core/eventBus');

// Janela para desfazer uma submission (desde o último insert). 5 min é
// suficiente para "ups, engano" sem permitir manipulação de stats
// retroactiva. Hard delete — não há compensating movement para evitar
// ruído em filtros de ranking.
const UNDO_WINDOW_MS = 5 * 60_000;

async function recordDelivery({
  discordId,
  itemId,
  quantity,
  movementType,
  notes = '',
  operationId = null,
  createdBy,
}) {
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new Error('Item não encontrado no catálogo.');

  if (quantity <= 0) throw new Error('Quantidade deve ser positiva.');

  const movement = await inventoryRepo.recordMovement({
    movementType,
    itemId,
    quantity,
    memberId: member.id,
    memberRole: member.role,
    origin: /bairrista|oficial/.test(movementType) ? 'membro' : 'org',
    destination: /bairrista|oficial/.test(movementType) ? 'org' : 'membro',
    context: operationId ? `Operação #${operationId}` : '',
    notes,
    operationId,
    createdBy,
  });

  metrics.inventoryMovements.inc();

  await logAudit({
    action: 'inventory_movement',
    entityType: 'inventory',
    entityId: String(movement.id),
    actorId: createdBy,
    afterState: {
      movementType,
      itemName: item.name,
      quantity,
      memberName: member.display_name,
      operationId,
    },
    context: notes,
  });

  // Fire-and-forget notify nos canais de stock
  const balanceAfter = await inventoryRepo.getStockForItem(itemId).catch(() => null);
  notifyMovement({
    movementType,
    itemName: item.name,
    quantity,
    memberName: member.display_name,
    memberDiscordId: member.discord_id,
    actorId: createdBy,
    operationId,
    balanceAfter,
    context: notes,
  }).catch(() => {});

  // Fire-and-forget: log dedicado dos Bairristas (entregas + vendas)
  const isBairristaMovement = /entrega_bairrista|venda_bairrista/.test(movementType);
  if (isBairristaMovement) {
    (async () => {
      const { start } = weekBounds();
      const weekStartStr = start.toISOString().split('T')[0];
      const [weekStats, rankPosition] = await Promise.all([
        bairristaStatsRepo.getWeeklyMaterialStats(member.discord_id).catch(() => null),
        bairristaStatsRepo.getRankingPosition(member.discord_id, weekStartStr).catch(() => null),
      ]);
      notifyBairristaMovement({
        movementType,
        itemName: item.name,
        quantity,
        itemPrice: parseFloat(item.estimated_value) || 0,
        memberName: member.display_name,
        memberDiscordId: member.discord_id,
        notes,
        weekStats,
        rankPosition,
      });
    })().catch(() => {});
  }

  // Event bus — subscribers podem projectar para Sheets / dashboards.
  eventBus
    .emitAsync('material.registered', {
      movementId: movement.id,
      movementType,
      itemId,
      itemName: item.name,
      itemValue: parseFloat(item.estimated_value) || 0,
      quantity,
      memberId: member.id,
      memberDiscordId: member.discord_id,
      memberRole: member.role,
      operationId,
      actorId: createdBy,
      balanceAfter,
      notes,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] material.registered: ${e.message}`));

  return { movement, member, item, balanceAfter: Number(balanceAfter ?? 0) };
}

/**
 * Submete um carrinho de N itens atómicamente. Todos os movements
 * partilham o mesmo `submission_id` (UUID v4) para:
 *   - agrupar no log-bairristas (1 embed por submission)
 *   - permitir undo em bulk dentro da janela UNDO_WINDOW_MS
 *
 * @param {object} opts
 * @param {string} opts.discordId
 * @param {'entrega'|'venda'} opts.tipo
 * @param {Array<{ itemId, quantity, unitPrice? }>} opts.lines
 *   - `unitPrice` só válido em vendas; entregas ignoram-no.
 * @param {string} [opts.globalNotes]
 * @param {string} opts.createdBy
 * @returns {Promise<{
 *   submissionId: string,
 *   movements: Array,
 *   member: object,
 *   tipo: string,
 *   totalQty: number,
 *   totalValue: number,
 *   lines: Array,
 * }>}
 */
async function recordDeliveryBatch({ discordId, tipo, lines, globalNotes = '', createdBy }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Carrinho vazio — adiciona pelo menos 1 item antes de submeter.');
  }
  if (!['entrega', 'venda'].includes(tipo)) {
    throw new Error(`Tipo inválido: ${tipo}`);
  }

  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');

  // Resolve movement_type: oficiais fazem entrega_oficial; bairristas
  // fazem entrega_bairrista. Vendas: apenas venda_bairrista (oficiais
  // não vendem mecanicamente no fluxo RP).
  const movementType =
    tipo === 'venda' ? 'venda_bairrista' : member.role === 'oficial' ? 'entrega_oficial' : 'entrega_bairrista';

  // Validação dos lines ANTES da transacção — falhas triviais devolvem
  // erro limpo sem abrir BEGIN/ROLLBACK desnecessário.
  const enrichedLines = [];
  for (const line of lines) {
    if (!line?.itemId) throw new Error('Line sem itemId.');
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Quantidade inválida para item ${line.itemId}.`);
    }
    const item = await inventoryRepo.getItemById(line.itemId);
    if (!item) throw new Error(`Item ${line.itemId} não encontrado.`);

    // Preço efectivo: custom (só vendas) ou estimated_value do catálogo.
    const basePrice = parseFloat(item.estimated_value) || 0;
    const customRaw = tipo === 'venda' ? Number(line.unitPrice) : null;
    const hasCustom = Number.isFinite(customRaw) && customRaw >= 0 && customRaw !== basePrice;
    const effectivePrice = hasCustom ? customRaw : basePrice;

    enrichedLines.push({
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      quantity: qty,
      basePrice,
      unitPrice: hasCustom ? customRaw : null, // só guarda se DIFERE do base
      effectivePrice,
      lineValue: qty * effectivePrice,
    });
  }

  const submissionId = crypto.randomUUID();

  // Transacção atómica — se um insert falha, nada persiste.
  const movements = await queryWithTransaction(async client => {
    const out = [];
    for (const l of enrichedLines) {
      const m = await inventoryRepo.recordMovement({
        movementType,
        itemId: l.itemId,
        quantity: l.quantity,
        memberId: member.id,
        memberRole: member.role,
        origin: 'membro',
        destination: 'org',
        context: '',
        notes: globalNotes,
        operationId: null,
        createdBy,
        submissionId,
        unitPrice: l.unitPrice, // NULL se preço base; valor se custom
        client,
      });
      out.push(m);
    }
    return out;
  });

  metrics.inventoryMovements.inc(enrichedLines.length);

  // Audit agregado — 1 entry para a submission inteira. Lines descritos
  // no afterState para rastreio completo.
  await logAudit({
    action: 'bairrista_submission',
    entityType: 'inventory',
    entityId: submissionId,
    actorId: createdBy,
    afterState: {
      submissionId,
      tipo,
      movementType,
      memberName: member.display_name,
      lines: enrichedLines.map(l => ({
        item: l.itemName,
        qty: l.quantity,
        unitPrice: l.unitPrice, // null = usou base
        effectivePrice: l.effectivePrice,
        value: l.lineValue,
      })),
      totalQty: enrichedLines.reduce((a, l) => a + l.quantity, 0),
      totalValue: enrichedLines.reduce((a, l) => a + l.lineValue, 0),
    },
    context: globalNotes,
  });

  // Events — emite 1 event por line para projecções existentes continuarem
  // a funcionar (sheets, dashboards) sem refactor massivo.
  for (const l of enrichedLines) {
    const balanceAfter = await inventoryRepo.getStockForItem(l.itemId).catch(() => null);
    eventBus
      .emitAsync('material.registered', {
        movementId: movements.find(m => m.item_id === l.itemId)?.id,
        submissionId,
        movementType,
        itemId: l.itemId,
        itemName: l.itemName,
        itemValue: l.effectivePrice,
        quantity: l.quantity,
        memberId: member.id,
        memberDiscordId: member.discord_id,
        memberRole: member.role,
        operationId: null,
        actorId: createdBy,
        balanceAfter,
        notes: globalNotes,
        at: new Date(),
      })
      .catch(e => warn(`[EVENT] material.registered: ${e.message}`));
  }

  const totalQty = enrichedLines.reduce((a, l) => a + l.quantity, 0);
  const totalValue = enrichedLines.reduce((a, l) => a + l.lineValue, 0);

  log(
    `[BAIRRISTA-BATCH] ${member.display_name} (${tipo}) submetteu ${enrichedLines.length} linhas, ${totalQty} qty, ${totalValue}€ — submission=${submissionId}`
  );

  // Notificação agregada no log-bairristas (1 embed). Fire-and-forget;
  // devolve messageId para o undo conseguir editar.
  (async () => {
    try {
      const { start } = weekBounds();
      const weekStartStr = start.toISOString().split('T')[0];
      const [weekStats, rankPosition] = await Promise.all([
        bairristaStatsRepo.getWeeklyMaterialStats(member.discord_id).catch(() => null),
        bairristaStatsRepo.getRankingPosition(member.discord_id, weekStartStr).catch(() => null),
      ]);
      const logResult = await notifyBairristaBatch({
        submissionId,
        movementType,
        tipo,
        lines: enrichedLines,
        totalQty,
        totalValue,
        memberName: member.display_name,
        memberDiscordId: member.discord_id,
        notes: globalNotes,
        weekStats,
        rankPosition,
      }).catch(() => null);
      if (logResult?.messageId) {
        await inventoryRepo
          .attachSubmissionLogMessage(submissionId, logResult.messageId, logResult.channelId)
          .catch(() => {});
      }
    } catch (e) {
      warn(`[BAIRRISTA-BATCH] log notify falhou: ${e.message}`);
    }
  })();

  return {
    submissionId,
    movements,
    member,
    tipo,
    movementType,
    totalQty,
    totalValue,
    lines: enrichedLines,
  };
}

/**
 * Desfaz uma submission dentro de UNDO_WINDOW_MS. Hard delete de todos
 * os movements + audit log + edit da mensagem no log-bairristas. O
 * caller (handler) deve validar autorização (só o próprio discord_id).
 *
 * @param {object} opts
 * @param {string} opts.submissionId
 * @param {string} opts.requesterDiscordId — deve ser o member_id da submission
 * @param {object} [opts.client] — Discord client para editar o log embed
 * @returns {Promise<{ undone: boolean, reason?: string, deletedCount?: number, linesSummary?: object }>}
 */
async function undoSubmission({ submissionId, requesterDiscordId, client = null }) {
  if (!submissionId) return { undone: false, reason: 'submission_id em falta' };

  const rows = await inventoryRepo.getSubmissionMovements(submissionId);
  if (!rows.length) return { undone: false, reason: 'Submission já não existe (provavelmente já desfeita).' };

  // Ownership check — só o autor da submission pode desfazer.
  const member = await memberRepo.findByDiscordId(requesterDiscordId);
  if (!member || rows[0].member_id !== member.id) {
    return { undone: false, reason: 'Só podes desfazer as tuas próprias submissões.' };
  }

  // Janela de tempo: última insert da submission.
  const newest = rows.reduce((a, r) => Math.max(a, new Date(r.created_at).getTime()), 0);
  if (Date.now() - newest > UNDO_WINDOW_MS) {
    return { undone: false, reason: `Passaram mais de ${Math.round(UNDO_WINDOW_MS / 60_000)} min — não podes desfazer.` };
  }

  // Captura info do log para editar depois
  const logMessageId = rows[0].log_message_id;
  const logChannelId = rows[0].log_channel_id;
  const linesSummary = rows.map(r => ({
    itemId: r.item_id,
    itemName: r.item_name,
    qty: r.quantity,
    unitPrice: r.unit_price,
    effectivePrice: Number(r.effective_price),
  }));
  const totalQty = linesSummary.reduce((a, l) => a + l.qty, 0);
  const totalValue = linesSummary.reduce((a, l) => a + l.qty * l.effectivePrice, 0);

  const deleted = await inventoryRepo.deleteSubmission(submissionId);

  await logAudit({
    action: 'bairrista_submission_undone',
    entityType: 'inventory',
    entityId: submissionId,
    actorId: requesterDiscordId,
    beforeState: {
      lines: linesSummary,
      totalQty,
      totalValue,
      movementIds: rows.map(r => r.id),
    },
  });

  log(`[BAIRRISTA-UNDO] submission=${submissionId} deleted ${deleted} movements por ${requesterDiscordId}.`);

  // Edita a mensagem original no log-bairristas — best-effort.
  if (client && logMessageId && logChannelId) {
    (async () => {
      try {
        const { editBairristaBatchAsCancelled } = require('./bairristaNotifier');
        await editBairristaBatchAsCancelled(client, logChannelId, logMessageId);
      } catch (e) {
        warn(`[BAIRRISTA-UNDO] edit log falhou: ${e.message}`);
      }
    })();
  }

  return { undone: true, deletedCount: deleted, linesSummary, totalQty, totalValue };
}

async function adjustStock({ itemId, quantity, notes, createdBy }) {
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error('Quantidade inválida. Tem de ser um número diferente de zero.');
  }

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new Error('Item não encontrado.');

  // Guard: não permitir ajuste que deixe stock negativo. Permite descontar
  // (quantity < 0) desde que saldo actual + quantity >= 0.
  if (quantity < 0) {
    const current = await inventoryRepo.getStockForItem(itemId).catch(() => 0);
    const balance = Number(current ?? 0);
    if (balance + quantity < 0) {
      throw new Error(
        `Stock insuficiente para **${item.name}** — saldo actual ${balance}, ajuste pedido ${quantity}. ` +
          `Máximo que podes descontar: ${balance}.`
      );
    }
  }

  const movement = await inventoryRepo.recordMovement({
    movementType: 'ajuste_manual',
    itemId,
    quantity,
    createdBy,
    notes,
  });

  await logAudit({
    action: 'stock_adjustment',
    entityType: 'inventory',
    entityId: String(movement.id),
    actorId: createdBy,
    afterState: { itemName: item.name, quantity, notes },
  });

  const balanceAfter = await inventoryRepo.getStockForItem(itemId).catch(() => null);
  notifyMovement({
    movementType: 'ajuste_manual',
    itemName: item.name,
    quantity,
    actorId: createdBy,
    balanceAfter,
    context: notes,
  }).catch(() => {});

  // Event bus — notification routing publica em INVENTORY_EVENTS.
  eventBus
    .emitAsync('material.adjusted', {
      movementId: movement.id,
      itemId,
      itemName: item.name,
      itemValue: parseFloat(item.estimated_value) || 0,
      quantity,
      actorId: createdBy,
      balanceAfter,
      notes,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] material.adjusted: ${e.message}`));

  return movement;
}

async function getCurrentStock() {
  return inventoryRepo.getStock();
}

async function getStockForItem(itemId) {
  return inventoryRepo.getStockForItem(itemId);
}

module.exports = {
  recordDelivery,
  recordDeliveryBatch,
  undoSubmission,
  adjustStock,
  getCurrentStock,
  getStockForItem,
  UNDO_WINDOW_MS,
};
