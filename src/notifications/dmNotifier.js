'use strict';
/**
 * DM Notifier — envia alertas por DM a users específicos ou a todos os admins.
 *
 * - sendDMAlert(userId, { title, description }, client) → DM a um user; 50007 é capturado.
 * - sendAdminAlert(message, client)        → DM a todos os membros com role admin/chefe/manda-chuva.
 *
 * Todos os resultados são auditados via logAudit (fire-and-forget).
 */

const { EmbedBuilder } = require('discord.js');
const { logAudit } = require('../audit/auditEngine');
const CONFIG = require('../config');
const ROLES = require('../config/roles');

const ADMIN_ROLE_NAMES = ['admin', 'chefe', 'manda-chuva'];
const ADMIN_ROLE_IDS = [
  ROLES.MANDA_CHUVA_ROLE_ID,
  ROLES.KINGPIN_ROLE_ID,
  ROLES.OG_ROLE_ID,
  ROLES.REAL_GANGSTER_ROLE_ID,
  ROLES.PATRAO_DI_ZONA_ROLE_ID,
].filter(Boolean);

/**
 * Envia DM embed a um user específico.
 *
 * @param {string} userId
 * @param {{ title?: string, description?: string }} payload
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ success: boolean, code?: string }>}
 */
async function sendDMAlert(userId, { title, description }, client) {
  if (!userId || !client) {
    return { success: false, code: 'MISSING_ARGS' };
  }

  let user;
  try {
    user = await client.users.fetch(userId);
  } catch {
    return { success: false, code: 'USER_NOT_FOUND' };
  }

  const embed = new EmbedBuilder().setTitle(title || 'Alerta').setDescription(description || '');

  try {
    await user.send({ embeds: [embed] });
    return { success: true };
  } catch (e) {
    if (e.code === 50007) {
      return { success: false, code: 'CANNOT_DM' };
    }
    throw e;
  }
}

/**
 * Envia DM a todos os membros com role de admin/chefe/manda-chuva.
 *
 * @param {string} message
 * @param {import('discord.js').Client} client
 * @returns {Promise<{ sent: number, failed: number, errors: string[] }>}
 */
async function sendAdminAlert(message, client) {
  if (!client) {
    logAudit({
      action: 'ADMIN_ALERT_FAILED',
      entityType: 'dm_notification',
      entityId: 'bulk',
      context: 'missing_client',
    });
    return { sent: 0, failed: 0, errors: ['missing_client'] };
  }

  const guild = CONFIG.DISCORD_GUILD_ID ? client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID) : null;
  if (!guild) {
    logAudit({
      action: 'ADMIN_ALERT_FAILED',
      entityType: 'dm_notification',
      entityId: 'bulk',
      context: 'guild_not_found',
    });
    return { sent: 0, failed: 0, errors: ['guild_not_found'] };
  }

  await guild.members.fetch().catch(() => null);

  const adminMembers = [];
  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;
    const hasAdminRole = member.roles.cache.some(role => {
      if (ADMIN_ROLE_IDS.includes(role.id)) return true;
      const name = role.name?.toLowerCase() || '';
      return ADMIN_ROLE_NAMES.includes(name);
    });
    if (hasAdminRole) adminMembers.push(member);
  }

  const results = await Promise.allSettled(
    adminMembers.map(member => sendDMAlert(member.user.id, { title: 'Alerta Admin', description: message }, client))
  );

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.success) {
        sent += 1;
      } else {
        failed += 1;
        if (!errors.includes(r.value.code)) errors.push(r.value.code);
      }
    } else {
      failed += 1;
      const code = r.reason?.code || r.reason?.message || 'UNKNOWN';
      if (!errors.includes(code)) errors.push(code);
    }
  }

  logAudit({
    action: failed === 0 ? 'ADMIN_ALERT_SENT' : 'ADMIN_ALERT_PARTIAL',
    entityType: 'dm_notification',
    entityId: 'bulk',
    context: JSON.stringify({ sent, failed, total: adminMembers.length, errors }),
  });

  return { sent, failed, errors };
}

module.exports = { sendDMAlert, sendAdminAlert };
