'use strict';
/**
 * Data quality repository — aggregates quality issues.
 */

const { query } = require('../db');

async function getMembersWithoutRecord() {
  const res = await query('SELECT discord_id, display_name, role FROM v_members_without_record');
  return res.rows;
}

async function getOrphanChannels() {
  const res = await query('SELECT channel_id, member_id, discord_id FROM v_orphan_channels');
  return res.rows;
}

async function getUnfinalizedSaidas() {
  const res = await query('SELECT id, status, created_at, created_by FROM v_unfinalized_saidas');
  return res.rows;
}

async function getOrdersWithoutPrice() {
  const res = await query('SELECT id, status, created_at FROM v_orders_without_price');
  return res.rows;
}

async function getDeliveryRequestsWithoutMember() {
  const res = await query('SELECT id, status, created_at FROM v_delivery_requests_without_member');
  return res.rows;
}

async function getStaleSheetSync() {
  const res = await query('SELECT last_synced_at FROM v_stale_sheet_sync');
  return res.rows;
}

async function getMembersWithRoleButNoFicha() {
  const res = await query(
    `SELECT m.id, m.discord_id, m.display_name, m.role
     FROM members m
     WHERE m.active = true
       AND m.role IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM member_stats ms WHERE ms.member_id = m.id
       )`
  );
  return res.rows;
}

async function getPendingDeliveries() {
  const res = await query(
    `SELECT dr.id, dr.status, dr.created_at, m.display_name
     FROM inventory_delivery_requests dr
     JOIN members m ON m.id = dr.member_id
     WHERE dr.status = 'pending' ORDER BY dr.created_at`
  );
  return res.rows;
}

async function getPendingOrders() {
  const res = await query(
    `SELECT o.id, o.status, o.created_at, m.display_name
     FROM orders o
     JOIN members m ON m.id = o.member_id
     WHERE o.status IN ('pending', 'received', 'under_review') ORDER BY o.created_at`
  );
  return res.rows;
}

async function getPendingPrizes() {
  const res = await query(
    `SELECT week_start, winner_member_id, prize_status, defined_at
     FROM weekly_prizes WHERE prize_status = 'por_definir' ORDER BY week_start`
  );
  return res.rows;
}

async function getAllIssues() {
  const [
    membersWithoutRecord,
    orphanChannels,
    unfinalizedSaidas,
    ordersWithoutPrice,
    deliveryRequestsWithoutMember,
    staleSheetSync,
    membersWithRoleButNoFicha,
    pendingDeliveries,
    pendingOrders,
    pendingPrizes,
  ] = await Promise.all([
    getMembersWithoutRecord(),
    getOrphanChannels(),
    getUnfinalizedSaidas(),
    getOrdersWithoutPrice(),
    getDeliveryRequestsWithoutMember(),
    getStaleSheetSync(),
    getMembersWithRoleButNoFicha(),
    getPendingDeliveries(),
    getPendingOrders(),
    getPendingPrizes(),
  ]);

  return {
    membersWithoutRecord,
    orphanChannels,
    unfinalizedSaidas,
    ordersWithoutPrice,
    deliveryRequestsWithoutMember,
    staleSheetSync,
    membersWithRoleButNoFicha,
    pendingDeliveries,
    pendingOrders,
    pendingPrizes,
    totalIssues:
      membersWithoutRecord.length +
      orphanChannels.length +
      unfinalizedSaidas.length +
      ordersWithoutPrice.length +
      deliveryRequestsWithoutMember.length +
      staleSheetSync.length +
      membersWithRoleButNoFicha.length,
  };
}

module.exports = {
  getMembersWithoutRecord,
  getOrphanChannels,
  getUnfinalizedSaidas,
  getOrdersWithoutPrice,
  getDeliveryRequestsWithoutMember,
  getStaleSheetSync,
  getMembersWithRoleButNoFicha,
  getPendingDeliveries,
  getPendingOrders,
  getPendingPrizes,
  getAllIssues,
};
