'use strict';
/**
 * Repositório de saídas — acesso à tabela `operations` (nome interno DB
 * preservado para minimizar risco de migrations). Semanticamente saídas.
 */
const { query, queryWithTransaction } = require('../db');
const { guardColumns } = require('../shared/sqlColumnGuard');

async function create({
  date,
  scheduledTime,
  spot,
  spotType,
  saidaType,
  leaderId,
  groupNumber = 1,
  maxParticipants = 12,
  notes = '',
  createdBy,
  client = null,
}) {
  const runner = client || { query: (sql, values) => query(sql, values) };
  const res = await runner.query(
    `INSERT INTO operations (date, scheduled_time, spot, spot_type, operation_type, leader_id, group_number, max_participants, notes, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [date, scheduledTime, spot, spotType || '', saidaType, leaderId, groupNumber, maxParticipants, notes, 'criada', createdBy]
  );
  return res.rows[0];
}

async function findById(id) {
  const res = await query(
    `
    SELECT o.*, m.display_name as leader_name, m.discord_id as leader_discord_id
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    WHERE o.id = $1
  `,
    [id]
  );
  return res.rows[0] || null;
}

async function findByDate(date) {
  const res = await query(
    `
    SELECT o.*, m.display_name as leader_name
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    WHERE o.date = $1 ORDER BY o.group_number
  `,
    [date]
  );
  return res.rows;
}

async function findRecent(limit = 20) {
  const res = await query(
    `
    SELECT o.*, m.display_name as leader_name
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    ORDER BY o.date DESC, o.group_number
    LIMIT $1
  `,
    [limit]
  );
  return res.rows;
}

async function findOpen() {
  const res = await query(`
    SELECT o.*, m.display_name as leader_name
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    WHERE o.status IN ('criada', 'em_preparacao', 'em_curso')
    ORDER BY o.date DESC, o.group_number
  `);
  return res.rows;
}

/** Saídas em liquidação — participantes a preencher resultados. */
async function findInLiquidacao() {
  const res = await query(`
    SELECT o.*, m.display_name as leader_name, m.discord_id as leader_discord_id
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    WHERE o.status = 'em_liquidacao'
    ORDER BY o.date DESC, o.group_number
  `);
  return res.rows;
}

/** Saídas activas (abertas + em liquidação) — para listagens de gestão. */
async function findActive() {
  const res = await query(`
    SELECT o.*, m.display_name as leader_name, m.discord_id as leader_discord_id
    FROM operations o
    LEFT JOIN members m ON m.id = o.leader_id
    WHERE o.status IN ('criada', 'em_preparacao', 'em_curso', 'em_liquidacao')
    ORDER BY o.date DESC, o.group_number
  `);
  return res.rows;
}

async function updateStatus(id, status, extras = {}) {
  const ALLOWED = new Set([
    'leader_id',
    'date',
    'scheduled_time',
    'spot',
    'spot_type',
    'operation_type',
    'group_number',
    'max_participants',
    'notes',
    'result',
    'had_fight',
    'had_craft',
    'had_domination',
    'enemy_name',
    'enemy_faction',
    'enemy_count',
    'our_kills',
    'survivors',
    'deaths',
    'returned_count',
    'returned_to_bairro_count',
    'supplied_value',
    'returned_value',
    'lost_value',
    'consumed_value',
    'gross_value',
    'net_value',
    'was_profitable',
    'crafted_value',
    'craft_amount',
    'characterized_count',
    'workers_count',
    'fighters_count',
    'result_notes',
    'start_time',
    'team_selected_at',
    'liquidation_started_at',
    'session_message_id',
    'session_channel_id',
    'end_time',
    'updated_at',
    'status',
  ]);
  const safe = guardColumns(extras, ALLOWED);
  const sets = ['status = $1', 'updated_at = NOW()'];
  const values = [status];
  let i = 2;
  for (const [key, value] of Object.entries(safe)) {
    if (key === 'updated_at' || key === 'status') continue;
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  values.push(id);
  const res = await query(`UPDATE operations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return res.rows[0] || null;
}

/** Fecha saída. resultData pode conter campos enriquecidos (result, had_craft, etc.). */
async function closeSaida(id, resultData) {
  return queryWithTransaction(async client => {
    const sets = ['status = $1', 'end_time = NOW()', 'updated_at = NOW()'];
    const values = ['concluida'];
    let i = 2;
    const fields = [
      'had_fight',
      'had_craft',
      'had_domination',
      'result',
      'enemy_name',
      'enemy_faction',
      'enemy_count',
      'our_kills',
      'survivors',
      'deaths',
      'returned_count',
      'returned_to_bairro_count',
      'supplied_value',
      'returned_value',
      'lost_value',
      'consumed_value',
      'gross_value',
      'net_value',
      'was_profitable',
      'crafted_value',
      'characterized_count',
      'workers_count',
      'spot_type',
      'result_notes',
    ];
    for (const field of fields) {
      if (resultData[field] !== undefined) {
        sets.push(`${field} = $${i}`);
        values.push(resultData[field]);
        i++;
      }
    }
    values.push(id);
    const res = await client.query(`UPDATE operations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
    return res.rows[0];
  });
}

async function addParticipant(saidaId, memberId, data = {}) {
  const res = await query(
    `INSERT INTO operation_participants
       (operation_id, member_id, role_in_op, brought_own_material, received_org_material,
        participant_type, own_weapon, weapon_item_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (operation_id, member_id) DO UPDATE SET
       role_in_op = EXCLUDED.role_in_op,
       brought_own_material = EXCLUDED.brought_own_material,
       received_org_material = EXCLUDED.received_org_material,
       participant_type = COALESCE(EXCLUDED.participant_type, operation_participants.participant_type),
       own_weapon = COALESCE(EXCLUDED.own_weapon, operation_participants.own_weapon),
       weapon_item_id = COALESCE(EXCLUDED.weapon_item_id, operation_participants.weapon_item_id),
       notes = EXCLUDED.notes
     RETURNING *`,
    [
      saidaId,
      memberId,
      data.roleInSaida || data.roleInOp || 'membro',
      data.broughtOwn || false,
      data.receivedOrgMaterial || data.receivedOrg || false,
      data.participantType || 'caracterizado',
      data.ownWeapon || false,
      data.weaponItemId || null,
      data.notes || '',
    ]
  );
  return res.rows[0];
}

async function countCharacterized(saidaId) {
  const res = await query(
    `SELECT COUNT(*)::int AS n FROM operation_participants
     WHERE operation_id = $1 AND participant_type = 'caracterizado'`,
    [saidaId]
  );
  return res.rows[0]?.n || 0;
}

async function updateParticipant(saidaId, memberId, fields) {
  if (!Object.keys(fields).length) return null;
  const ALLOWED = new Set([
    'role_in_op',
    'brought_own_material',
    'received_org_material',
    'participant_type',
    'own_weapon',
    'weapon_item_id',
    'notes',
    'kills',
    'deaths',
    'deaths_count',
    'survived',
    'returned',
    'returned_weapon',
    'returned_material',
    'material_returned_qty',
    'material_lost_qty',
    'material_source',
    'died',
    'weapon_return_status',
    'individual_result_submitted',
    'individual_result_at',
    'issued_value',
    'returned_value',
    'lost_value',
    'consumed_value',
    'net_material_delta',
    'performance_score',
    'discipline_score',
    'mvp_flag',
    'rating_delta',
    'settled',
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
  values.push(saidaId, memberId);
  const res = await query(
    `UPDATE operation_participants SET ${sets.join(', ')} WHERE operation_id = $${i} AND member_id = $${i + 1} RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

async function getParticipants(saidaId) {
  const res = await query(
    `
    SELECT op.*, m.display_name, m.discord_id, m.role as member_role
    FROM operation_participants op
    JOIN members m ON m.id = op.member_id
    WHERE op.operation_id = $1
    ORDER BY op.role_in_op, m.display_name
  `,
    [saidaId]
  );
  return res.rows;
}

async function addMaterial(saidaId, itemId, direction, quantity, memberId = null, notes = '') {
  const res = await query(
    `INSERT INTO operation_materials (operation_id, item_id, direction, quantity, member_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [saidaId, itemId, direction, quantity, memberId, notes]
  );
  return res.rows[0];
}

async function getMaterials(saidaId) {
  const res = await query(
    `
    SELECT om.*, i.name as item_name, i.category as item_category, i.estimated_value
    FROM operation_materials om
    JOIN items i ON i.id = om.item_id
    WHERE om.operation_id = $1
    ORDER BY om.direction, i.name
  `,
    [saidaId]
  );
  return res.rows;
}

async function getMaterialSummary(saidaId) {
  const res = await query(
    `
    SELECT direction, SUM(quantity) as total,
      SUM(quantity * COALESCE(i.estimated_value, 0)) as weighted_total
    FROM operation_materials om
    JOIN items i ON i.id = om.item_id
    WHERE om.operation_id = $1
    GROUP BY direction
  `,
    [saidaId]
  );
  return res.rows.reduce((acc, r) => {
    acc[r.direction] = { total: parseInt(r.total), weightedTotal: parseFloat(r.weighted_total) || 0 };
    return acc;
  }, {});
}

/** Agregado de material por participante (used in settle flow). */
async function getParticipantMaterialTotals(saidaId, memberId) {
  const res = await query(
    `
    SELECT direction, SUM(quantity) as qty, SUM(quantity * COALESCE(i.estimated_value, 0)) as value
    FROM operation_materials om
    JOIN items i ON i.id = om.item_id
    WHERE om.operation_id = $1 AND om.member_id = $2
    GROUP BY direction
  `,
    [saidaId, memberId]
  );
  return res.rows.reduce((acc, r) => {
    acc[r.direction] = { qty: parseInt(r.qty), value: parseFloat(r.value) || 0 };
    return acc;
  }, {});
}

async function countParticipationsByMember(memberId, weekStart = null, weekEnd = null) {
  let sql =
    'SELECT COUNT(*) as count FROM operation_participants op JOIN operations o ON o.id = op.operation_id WHERE op.member_id = $1';
  const params = [memberId];
  if (weekStart && weekEnd) {
    sql += ' AND o.date >= $2 AND o.date <= $3';
    params.push(weekStart, weekEnd);
  }
  const res = await query(sql, params);
  return parseInt(res.rows[0]?.count || 0);
}

async function updateSessionMessage(saidaId, messageId, channelId) {
  return query('UPDATE operations SET session_message_id = $1, session_channel_id = $2 WHERE id = $3', [
    messageId,
    channelId,
    saidaId,
  ]);
}

async function deleteById(id) {
  const res = await query('DELETE FROM operations WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

const deleteSaida = deleteById;

module.exports = {
  create,
  findById,
  findByDate,
  findRecent,
  findOpen,
  findInLiquidacao,
  findActive,
  updateStatus,
  closeSaida,
  addParticipant,
  updateParticipant,
  getParticipants,
  countCharacterized,
  updateSessionMessage,
  addMaterial,
  getMaterials,
  getMaterialSummary,
  getParticipantMaterialTotals,
  countParticipationsByMember,
  deleteById,
  deleteSaida,
};
