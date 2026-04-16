'use strict';
const { query } = require('../db');
const { warn, log } = require('../logger');
const CONFIG = require('../config');

async function logAudit({ action, entityType, entityId, actorId, actorName = '', beforeState = null, afterState = null, context = '' }) {
  try {
    await query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, actor_id, actor_name, before_state, after_state, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [action, entityType, entityId || '', actorId, actorName,
       beforeState ? JSON.stringify(beforeState) : null,
       afterState ? JSON.stringify(afterState) : null,
       context]
    );
  } catch (e) {
    warn(`[AUDIT] Falha ao registar: ${action} — ${e.message}`);
  }
}

async function sendAuditToChannel(client, { title, description, fields = [], color = 0x2F3136 }) {
  if (!CONFIG.AUDIT_LOG_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(CONFIG.AUDIT_LOG_CHANNEL_ID);
    if (!channel) return;
    const { brandEmbed } = require('../shared/embedBuilders');
    const embed = brandEmbed('SHORT')
      .setTitle(title)
      .setDescription(description || null)
      .setColor(color);
    if (fields.length) embed.addFields(fields);
    await channel.send({ embeds: [embed] });
  } catch (e) {
    warn(`[AUDIT] Falha ao enviar para canal: ${e.message}`);
  }
}

async function getRecentLogs(limit = 50, entityType = null) {
  let sql = 'SELECT * FROM audit_logs';
  const params = [];
  if (entityType) {
    sql += ' WHERE entity_type = $1';
    params.push(entityType);
  }
  sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);
  const res = await query(sql, params);
  return res.rows;
}

module.exports = { logAudit, sendAuditToChannel, getRecentLogs };
