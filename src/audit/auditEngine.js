'use strict';
const { query } = require('../db');
const { warn } = require('../logger');
const CONFIG = require('../config');
const fs = require('fs');
const path = require('path');

const FALLBACK_PATH = path.join(process.cwd(), 'logs', 'audit-fallback.log');

async function logAudit({
  action,
  entityType,
  entityId,
  actorId,
  actorName = '',
  beforeState = null,
  afterState = null,
  context = '',
}) {
  try {
    await query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, actor_id, actor_name, before_state, after_state, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        action,
        entityType,
        entityId || '',
        actorId,
        actorName,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null,
        context,
      ]
    );
  } catch (e) {
    warn(`[AUDIT] Falha ao registar: ${action} — ${e.message}`);
    try {
      const line =
        JSON.stringify({
          timestamp: new Date().toISOString(),
          action,
          entityType,
          entityId: entityId || '',
          actorId,
          actorName,
          beforeState,
          afterState,
          context,
        }) + '\n';
      fs.mkdirSync(path.dirname(FALLBACK_PATH), { recursive: true });
      fs.appendFileSync(FALLBACK_PATH, line);
    } catch (fallbackErr) {
      warn(`[AUDIT] Fallback também falhou: ${fallbackErr.message}`);
    }
  }
}

async function sendAuditToChannel(client, { title, description, fields = [], color = null }) {
  if (!CONFIG.AUDIT_LOG_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(CONFIG.AUDIT_LOG_CHANNEL_ID);
    if (!channel) return;
    const { brandEmbed, COLOR } = require('../shared/embedBuilders');
    const finalColor = color || COLOR.DARK;
    const embed = brandEmbed('SHORT')
      .setTitle(title)
      .setDescription(description || null)
      .setColor(finalColor);
    if (fields.length) embed.addFields(fields);
    await channel.send({ embeds: [embed] });
  } catch (e) {
    warn(`[AUDIT] Falha ao enviar para canal: ${e.message}`);
  }
}

function _buildWhere({ entityType, action, actorId, since, until }) {
  const conditions = [];
  const params = [];
  let idx = 0;
  if (entityType) {
    conditions.push(`entity_type = $${++idx}`);
    params.push(entityType);
  }
  if (action) {
    conditions.push(`action = $${++idx}`);
    params.push(action);
  }
  if (actorId) {
    conditions.push(`actor_id = $${++idx}`);
    params.push(actorId);
  }
  if (since) {
    conditions.push(`created_at >= $${++idx}`);
    params.push(since);
  }
  if (until) {
    conditions.push(`created_at <= $${++idx}`);
    params.push(until);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params, idx };
}

async function getLogs({
  limit = 50,
  offset = 0,
  entityType = null,
  action = null,
  actorId = null,
  since = null,
  until = null,
} = {}) {
  const { where, params, idx } = _buildWhere({ entityType, action, actorId, since, until });
  const sql = `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx + 1} OFFSET $${idx + 2}`;
  const res = await query(sql, [...params, limit, offset]);
  return res.rows;
}

async function getLogsCount({ entityType = null, action = null, actorId = null, since = null, until = null } = {}) {
  const { where, params } = _buildWhere({ entityType, action, actorId, since, until });
  const sql = `SELECT COUNT(*)::int AS count FROM audit_logs ${where}`;
  const res = await query(sql, params);
  return res.rows[0]?.count || 0;
}

async function getLogsForActor(actorId, { limit = 50, offset = 0 } = {}) {
  return getLogs({ limit, offset, actorId });
}

async function getRecentLogs(limit = 20) {
  return getLogs({ limit: Math.min(Math.max(1, limit), 100) });
}

module.exports = { logAudit, sendAuditToChannel, getLogs, getLogsCount, getLogsForActor, getRecentLogs };
