'use strict';
const { query } = require('../db');
const { MOVEMENT_TYPE, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES } = require('../shared/movementTypes');
const { guardColumns } = require('../shared/sqlColumnGuard');

async function getItems(activeOnly = true) {
  const sql = activeOnly
    ? 'SELECT * FROM items WHERE active = true ORDER BY category, name'
    : 'SELECT * FROM items ORDER BY category, name';
  const res = await query(sql);
  return res.rows;
}

async function getItemById(id) {
  const res = await query('SELECT * FROM items WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getItemByName(name) {
  const res = await query('SELECT * FROM items WHERE LOWER(name) = LOWER($1)', [name]);
  return res.rows[0] || null;
}

/**
 * Fuzzy match por nome — para busca em modals de cart/inventário.
 * Estratégia:
 *   1. Exact case-insensitive match → prioritário
 *   2. Prefix match (começa com o termo) — ordenado por length asc
 *   3. Substring match (contém o termo) — ordenado por length asc
 * Devolve até `limit` resultados, com _score entre 3 (exact) e 1 (substring).
 */
async function searchItemsByName(term, { limit = 5, activeOnly = true } = {}) {
  if (!term || String(term).trim().length < 2) return [];
  const t = String(term).trim();
  const wildcard = `%${t}%`;
  const prefix = `${t}%`;
  const whereActive = activeOnly ? 'AND active = true' : '';
  const res = await query(
    `
    SELECT *,
           CASE
             WHEN LOWER(name) = LOWER($1) THEN 3
             WHEN LOWER(name) LIKE LOWER($2) THEN 2
             WHEN LOWER(name) LIKE LOWER($3) THEN 1
             ELSE 0
           END AS _score,
           LENGTH(name) AS _len
      FROM items
     WHERE (LOWER(name) = LOWER($1) OR LOWER(name) LIKE LOWER($2) OR LOWER(name) LIKE LOWER($3)) ${whereActive}
     ORDER BY _score DESC, _len ASC, name ASC
     LIMIT $4
  `,
    [t, prefix, wildcard, limit]
  );
  return res.rows;
}

async function createItem({ name, category = 'outros', unit = 'unidade', estimatedValue = null, notes = '' }) {
  const res = await query(
    `INSERT INTO items (name, category, unit, estimated_value, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, category, unit, estimatedValue, notes]
  );
  return res.rows[0];
}

async function updateItem(id, fields) {
  const ALLOWED = new Set([
    'name',
    'category',
    'unit',
    'estimated_value',
    'active',
    'orderable',
    'counts_for_stock',
    'counts_for_rankings',
    'purchase_price',
    'min_sale_price',
    'max_sale_price',
    'target_stock',
    'supplier',
    'notes',
  ]);
  const safe = guardColumns(fields, ALLOWED);
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(safe)) {
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  values.push(id);
  const res = await query(`UPDATE items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return res.rows[0] || null;
}

async function recordMovement({
  movementType,
  itemId,
  quantity,
  memberId = null,
  memberRole = '',
  origin = '',
  destination = '',
  context = '',
  notes = '',
  operationId = null,
  createdBy,
  // Campos novos (migration 038) — opcionais para não afectar callers
  // existentes (saídas, ajustes). Só cart-based submissions os populam.
  submissionId = null,
  unitPrice = null,
  client = null, // opcional: pg client já em transacção (recordDeliveryBatch)
}) {
  const runner = client || { query: (sql, values) => query(sql, values) };
  const res = await runner.query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, member_id, member_role, origin, destination,
      context, notes, saida_id, created_by, submission_id, unit_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [
      movementType,
      itemId,
      quantity,
      memberId,
      memberRole,
      origin,
      destination,
      context,
      notes,
      operationId,
      createdBy,
      submissionId,
      unitPrice,
    ]
  );
  return res.rows[0];
}

/**
 * Bulk insert de movements numa única query (UNNEST).
 * Usado por recordDeliveryBatch para atomicidade e performance.
 */
async function recordMovementsBulk({
  lines,
  movementType,
  memberId,
  memberRole,
  origin,
  destination,
  context,
  notes,
  operationId,
  createdBy,
  submissionId,
  client = null,
}) {
  const runner = client || { query: (sql, values) => query(sql, values) };
  const movementTypes = lines.map(() => movementType);
  const itemIds = lines.map(l => l.itemId);
  const quantities = lines.map(l => l.quantity);
  const memberIds = lines.map(() => memberId);
  const memberRoles = lines.map(() => memberRole);
  const origins = lines.map(() => origin);
  const destinations = lines.map(() => destination);
  const contexts = lines.map(() => context);
  const notesArray = lines.map(() => notes);
  const operationIds = lines.map(() => operationId);
  const createdBys = lines.map(() => createdBy);
  const submissionIds = lines.map(() => submissionId);
  const unitPrices = lines.map(l => l.unitPrice ?? null);

  const res = await runner.query(
    `INSERT INTO inventory_movements
      (movement_type, item_id, quantity, member_id, member_role, origin, destination,
       context, notes, saida_id, created_by, submission_id, unit_price)
     SELECT * FROM UNNEST(
       $1::text[], $2::int[], $3::int[], $4::int[], $5::text[], $6::text[], $7::text[],
       $8::text[], $9::text[], $10::int[], $11::text[], $12::uuid[], $13::numeric[]
     )
     RETURNING *`,
    [
      movementTypes,
      itemIds,
      quantities,
      memberIds,
      memberRoles,
      origins,
      destinations,
      contexts,
      notesArray,
      operationIds,
      createdBys,
      submissionIds,
      unitPrices,
    ]
  );
  return res.rows;
}

/**
 * Actualiza log_message_id / log_channel_id em bulk para os movements de
 * uma submission. Chamado após o batch notifier postar o embed — assim
 * o undo pode encontrar e editar a mensagem sem state em memória.
 */
async function attachSubmissionLogMessage(submissionId, messageId, channelId) {
  if (!submissionId || !messageId) return null;
  const res = await query(
    `UPDATE inventory_movements
        SET log_message_id = $2, log_channel_id = $3
      WHERE submission_id = $1
    RETURNING id`,
    [submissionId, messageId, channelId || null]
  );
  return res.rowCount;
}

/**
 * Lookup dos movements de uma submission — usado pelo undo.
 * Devolve rows com item_name para edição do log embed.
 */
async function getSubmissionMovements(submissionId) {
  if (!submissionId) return [];
  const res = await query(
    `SELECT im.*, i.name AS item_name,
            COALESCE(im.unit_price, i.estimated_value, 0) AS effective_price
       FROM inventory_movements im
       JOIN items i ON i.id = im.item_id
      WHERE im.submission_id = $1
      ORDER BY im.created_at`,
    [submissionId]
  );
  return res.rows;
}

/**
 * Devolve a submission mais recente de um membro de um tipo específico
 * (entrega_bairrista ou venda_bairrista), para "Repetir última".
 * Só itemId + quantity — preço é re-resolvido na altura (evita time-travel
 * de preços antigos).
 */
async function getRecentSubmissions({ limit = 20, memberId = null, dateFrom = null, dateTo = null } = {}) {
  let sql = `
    SELECT DISTINCT ON (im.submission_id)
      im.submission_id,
      im.movement_type,
      im.member_id,
      m.display_name AS member_name,
      im.created_at,
      im.created_by,
      COUNT(*) OVER (PARTITION BY im.submission_id) AS line_count,
      SUM(im.quantity) OVER (PARTITION BY im.submission_id) AS total_qty
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    WHERE im.submission_id IS NOT NULL
  `;
  const params = [];
  let p = 1;
  if (memberId) {
    sql += ` AND im.member_id = $${p}`;
    params.push(memberId);
    p++;
  }
  if (dateFrom) {
    sql += ` AND im.created_at >= $${p}`;
    params.push(dateFrom);
    p++;
  }
  if (dateTo) {
    sql += ` AND im.created_at <= $${p}`;
    params.push(dateTo);
    p++;
  }
  sql += ` ORDER BY im.submission_id DESC, im.created_at DESC LIMIT $${p}`;
  params.push(limit);
  const res = await query(sql, params);
  return res.rows;
}

async function getLastSubmissionForMember(memberId, movementType) {
  if (!memberId) return null;
  const sub = await query(
    `SELECT submission_id, MAX(created_at) AS last_at
       FROM inventory_movements
      WHERE member_id = $1
        AND submission_id IS NOT NULL
        AND movement_type = $2
        AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY submission_id
      ORDER BY last_at DESC
      LIMIT 1`,
    [memberId, movementType]
  );
  if (!sub.rows[0]) return null;
  const sid = sub.rows[0].submission_id;
  const lines = await query(
    `SELECT im.item_id, i.name AS item_name, i.category, im.quantity
       FROM inventory_movements im
       JOIN items i ON i.id = im.item_id
      WHERE im.submission_id = $1
      ORDER BY im.id`,
    [sid]
  );
  return {
    submissionId: sid,
    lastAt: sub.rows[0].last_at,
    lines: lines.rows,
  };
}

/**
 * Hard delete de todos os movements de uma submission. Idempotente.
 * Caller deve verificar janela de tempo e autorização antes de chamar.
 */
async function deleteSubmission(submissionId) {
  if (!submissionId) return 0;
  const res = await query('DELETE FROM inventory_movements WHERE submission_id = $1', [submissionId]);
  return res.rowCount;
}

// ── Stock balance — sinal por movement_type ─────────────────────────────────
// IMPORTANTE: saldo_inicial conta como positivo (era o bug pré-Fase 7 — o
// bootstrap inseria movimentos `saldo_inicial` mas o CASE caía no ELSE 0).
// Inclui também todas as direcções inversas explicitamente; ELSE 0 fica como
// rede de segurança para movement_types desconhecidos.
async function getStock() {
  const res = await query(
    `
    SELECT i.id, i.name, i.category, i.unit, i.estimated_value,
      COALESCE(SUM(
        CASE
          WHEN im.movement_type = ANY($1::text[])
            THEN im.quantity
          WHEN im.movement_type = ANY($2::text[])
            THEN -im.quantity
          WHEN im.movement_type = $3
            THEN im.quantity
          ELSE 0
        END
      ), 0) as balance
    FROM items i
    LEFT JOIN inventory_movements im ON im.item_id = i.id
    WHERE i.active = true
    GROUP BY i.id, i.name, i.category, i.unit, i.estimated_value
    ORDER BY i.category, i.name
  `,
    [STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES, MOVEMENT_TYPE.AJUSTE_MANUAL]
  );
  return res.rows;
}

async function getStockForItem(itemId) {
  const res = await query(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type = ANY($2::text[])
          THEN quantity
        WHEN movement_type = ANY($3::text[])
          THEN -quantity
        WHEN movement_type = $4
          THEN quantity
        ELSE 0
      END
    ), 0) as balance
    FROM inventory_movements WHERE item_id = $1
  `,
    [itemId, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES, MOVEMENT_TYPE.AJUSTE_MANUAL]
  );
  return parseInt(res.rows[0]?.balance || 0);
}

async function getMemberMovements(memberId, limit = 50) {
  const res = await query(
    `
    SELECT im.*, i.name as item_name, i.category as item_category
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.member_id = $1
    ORDER BY im.created_at DESC
    LIMIT $2
  `,
    [memberId, limit]
  );
  return res.rows;
}

async function getMovementsByOperation(operationId) {
  const res = await query(
    `
    SELECT im.*, i.name as item_name
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.saida_id = $1
    ORDER BY im.created_at
  `,
    [operationId]
  );
  return res.rows;
}

async function getMemberTotals(memberId) {
  const res = await query(
    `
    SELECT movement_type, SUM(quantity) as total
    FROM inventory_movements
    WHERE member_id = $1
    GROUP BY movement_type
  `,
    [memberId]
  );
  return res.rows.reduce((acc, r) => {
    acc[r.movement_type] = parseInt(r.total);
    return acc;
  }, {});
}

async function getWeeklyMovements(weekStart, weekEnd) {
  // `weighted_value` aqui conta apenas QUANTIDADE (não multiplica por preço).
  // Semântica alinhada com promoções: 25k itens → O Gunão, 50k → Gangster Fodido.
  // Coluna mantém o nome por compatibilidade com weekly_rankings.weighted_value.
  const res = await query(
    `
    SELECT im.member_id, m.discord_id, m.display_name, m.role as member_role,
      SUM(CASE WHEN im.movement_type IN ('entrega_bairrista', 'entrega_oficial') THEN im.quantity ELSE 0 END) as deliveries,
      SUM(CASE WHEN im.movement_type = 'venda_bairrista' THEN im.quantity ELSE 0 END) as sales,
      SUM(CASE WHEN im.movement_type IN ('entrega_bairrista', 'venda_bairrista', 'entrega_oficial')
          THEN im.quantity ELSE 0 END) as weighted_value
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    JOIN items i ON i.id = im.item_id
    WHERE im.created_at >= $1 AND im.created_at <= $2
      AND im.movement_type IN ('entrega_bairrista', 'venda_bairrista', 'entrega_oficial')
    GROUP BY im.member_id, m.discord_id, m.display_name, m.role
    ORDER BY weighted_value DESC
  `,
    [weekStart, weekEnd]
  );
  return res.rows;
}

module.exports = {
  getItems,
  getItemById,
  getItemByName,
  searchItemsByName,
  createItem,
  updateItem,
  recordMovement,
  recordMovementsBulk,
  getStock,
  getStockForItem,
  getMemberMovements,
  getMovementsByOperation,
  getMemberTotals,
  getWeeklyMovements,
  attachSubmissionLogMessage,
  getSubmissionMovements,
  getRecentSubmissions,
  getLastSubmissionForMember,
  deleteSubmission,
};
