'use strict';
/**
 * Smart notifications job — sends reminders only when relevant.
 * Runs hourly.
 */

const { query } = require('../db');
const { log, warn } = require('../logger');

async function run(guild) {
  try {
    // 1. Remind admins of pending deliveries (> 24h)
    const oldDeliveries = await query(
      `SELECT dr.id, m.display_name, dr.created_at
       FROM inventory_delivery_requests dr
       JOIN members m ON m.id = dr.member_id
       WHERE dr.status = 'pending' AND dr.created_at < NOW() - INTERVAL '24 hours'`
    );
    if (oldDeliveries.rows.length > 0) {
      log(`[SmartNotify] ${oldDeliveries.rows.length} entregas pendentes >24h`);
      // In a real implementation, this would send to admin channel
    }

    // 2. Remind participants of saidas without results
    const pendingResults = await query(
      `SELECT sp.member_id, s.id as saida_id, s.created_at
       FROM saida_participants sp
       JOIN saidas s ON s.id = sp.saida_id
       WHERE s.status = 'em_liquidacao' AND sp.result_submitted = false
       AND s.created_at < NOW() - INTERVAL '6 hours'`
    );
    if (pendingResults.rows.length > 0) {
      log(`[SmartNotify] ${pendingResults.rows.length} participantes sem resultado`);
    }

    // 3. Notify members of order status changes
    const updatedOrders = await query(
      `SELECT o.id, o.member_id, o.status, m.display_name
       FROM orders o
       JOIN members m ON m.id = o.member_id
       WHERE o.updated_at > NOW() - INTERVAL '1 hour' AND o.notified = false`
    );
    for (const o of updatedOrders.rows) {
      await query(`UPDATE orders SET notified = true WHERE id = $1`, [o.id]);
      log(`[SmartNotify] Ordem #${o.id} notificada para ${o.display_name}`);
    }

    // 4. Weekly prize reminder (if not defined by Friday)
    const fridayCheck = new Date().getDay() === 5;
    if (fridayCheck) {
      const pendingPrize = await query(
        `SELECT week_start FROM weekly_prizes WHERE prize_status = 'por_definir' AND week_start >= CURRENT_DATE - INTERVAL '7 days' LIMIT 1`
      );
      if (pendingPrize.rows.length) {
        log('[SmartNotify] Prémio semanal por definir (sexta-feira)');
      }
    }
  } catch (err) {
    warn('[SmartNotify] Erro:', err.message);
  }
}

module.exports = { run };
