'use strict';
/**
 * Stock alert engine — monitoriza items com alert_enabled=true e dispara
 * aviso quando balance < alert_threshold.
 *
 * Throttle: max 1 alerta por item por 24h (via items.last_alert_at).
 * Canal alvo: 'alertas-stock' na categoria STOCK_CHANNELS_CATEGORY_KEY.
 *
 * Job corre hourly no scheduler.
 */

const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { query, queryWithTransaction } = require('../db');
const { log, warn } = require('../logger');
const { queueMessage } = require('../discordQueue');

let _client = null;
function setClient(c) { _client = c; }

// Canal alvo — criado/resolvido pelo stockNotifier via STOCK_CHANNELS.alertas
async function _resolveAlertChannel() {
  if (!_client) return null;
  const guild = _client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return null;
  // Procura canal com slug 'alertas-stock' (case-insensitive).
  const target = Array.from(guild.channels.cache.values()).find(c =>
    c.isTextBased?.() && /alertas.?stock/i.test(c.name)
  );
  return target || null;
}

// Calcula balance global por item (soma over all locations).
const BALANCE_CASE = `
  CASE
    WHEN movement_type IN ('saldo_inicial','entrega_morador','venda_morador','entrega_oficial','devolucao_operacao','apreendido','craftado')
      THEN quantity
    WHEN movement_type IN ('fornecimento_org','consumo_operacao','perda_operacao')
      THEN -quantity
    WHEN movement_type = 'ajuste_manual' THEN quantity
    ELSE 0
  END`;

/** Devolve items elegíveis para alerta com balance actual. */
async function getAlertableItems() {
  const r = await query(`
    WITH balances AS (
      SELECT item_id, COALESCE(SUM(${BALANCE_CASE}), 0)::int AS balance
      FROM inventory_movements GROUP BY item_id
    )
    SELECT i.id, i.name, i.category, i.alert_threshold, i.last_alert_at,
           COALESCE(b.balance, 0) AS balance,
           COALESCE(i.estimated_value, 0) AS estimated_value
      FROM items i
      LEFT JOIN balances b ON b.item_id = i.id
     WHERE i.active = true
       AND i.alert_enabled = true
       AND i.alert_threshold IS NOT NULL
       AND i.alert_threshold > 0
  `);
  return r.rows;
}

async function checkAndAlert({ dryRun = false, throttleHours = 24 } = {}) {
  const items = await getAlertableItems();
  const breaches = [];
  const now = Date.now();
  const throttleMs = throttleHours * 60 * 60 * 1000;

  for (const it of items) {
    if (it.balance >= it.alert_threshold) continue;
    const lastAlertMs = it.last_alert_at ? new Date(it.last_alert_at).getTime() : 0;
    const recentlyAlerted = (now - lastAlertMs) < throttleMs;
    if (recentlyAlerted) continue;
    breaches.push(it);
  }

  if (!breaches.length) return { checked: items.length, alerted: 0, ms: 0 };

  if (dryRun) return { checked: items.length, alerted: breaches.length, dryRun: true, breaches };

  // Marca last_alert_at para throttle
  await queryWithTransaction(async (client) => {
    for (const b of breaches) {
      await client.query('UPDATE items SET last_alert_at = NOW() WHERE id = $1', [b.id]);
    }
  });

  // Publica no canal
  const ch = await _resolveAlertChannel();
  if (!ch) {
    warn(`[STOCK_ALERT] canal alertas-stock não encontrado · ${breaches.length} breaches ignorados`);
    return { checked: items.length, alerted: 0, channelMissing: true };
  }

  // Agrupa por categoria
  const byCat = {};
  for (const b of breaches) (byCat[b.category] = byCat[b.category] || []).push(b);

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Alerta de Stock Crítico')
    .setDescription(`${breaches.length} item${breaches.length !== 1 ? 's' : ''} abaixo do threshold. Repor quando possível.`)
    .setColor(0xE67E22)
    .setTimestamp(new Date())
    .setFooter({ text: 'Firma RedWood · Stock Alerts' });

  for (const [cat, items] of Object.entries(byCat)) {
    const lines = items
      .sort((a, b) => (a.balance / a.alert_threshold) - (b.balance / b.alert_threshold))
      .map(b => {
        const pct = b.alert_threshold > 0 ? Math.round((b.balance / b.alert_threshold) * 100) : 0;
        const severity = pct < 20 ? '🔴' : pct < 50 ? '🟠' : '🟡';
        return `${severity} **${b.name}** — \`${b.balance}\` / \`${b.alert_threshold}\` (${pct}%)`;
      });
    embed.addFields({ name: `📦 ${cat.toUpperCase()}`, value: lines.join('\n').slice(0, 1024), inline: false });
  }

  await queueMessage(ch.id, { embeds: [embed] }).catch(e => warn(`[STOCK_ALERT] post falhou: ${e.message}`));
  log(`[STOCK_ALERT] ${breaches.length} alertas publicados em #${ch.name}`);
  return { checked: items.length, alerted: breaches.length, channel: ch.name };
}

module.exports = { setClient, checkAndAlert, getAlertableItems };
