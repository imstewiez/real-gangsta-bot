'use strict';
/**
 * Cemitério — registo de kills, leaderboard, publicação no canal dedicado.
 */

const { query } = require('../db');
const { memberRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const CONFIG = require('../config');
const { EmbedBuilder } = require('discord.js');

async function recordKill({ killerDiscordId, victimName, victimDiscordId = null, context = '', operationId = null, date = null, notes = '', createdBy }) {
  if (!victimName?.trim()) throw new Error('Nome da vítima obrigatório.');

  const killer = await memberRepo.findByDiscordId(killerDiscordId);
  if (!killer) throw new Error('Killer não encontrado na base de membros.');

  const res = await query(
    `INSERT INTO cemetery_kills
       (killer_id, victim_name, victim_discord_id, context, operation_id, date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8)
     RETURNING *`,
    [killer.id, victimName.trim(), victimDiscordId, context, operationId, date, notes, createdBy]
  );
  const kill = res.rows[0];

  await logAudit({
    action: 'kill_recorded',
    entityType: 'kill',
    entityId: String(kill.id),
    actorId: createdBy,
    afterState: { killer: killerDiscordId, victim: victimName, operationId },
  });

  return { ...kill, killer };
}

async function getLeaderboard(limit = 10, windowDays = null) {
  const params = [limit];
  const window = windowDays
    ? `AND k.created_at >= NOW() - INTERVAL '${parseInt(windowDays)} days'`
    : '';
  const res = await query(`
    SELECT m.display_name, m.discord_id, COUNT(*) as kills
    FROM cemetery_kills k
    JOIN members m ON m.id = k.killer_id
    WHERE 1=1 ${window}
    GROUP BY m.id, m.display_name, m.discord_id
    ORDER BY kills DESC, m.display_name
    LIMIT $1
  `, params);
  return res.rows.map(r => ({ ...r, kills: parseInt(r.kills) }));
}

async function getRecent(limit = 20) {
  const res = await query(`
    SELECT k.*, m.display_name as killer_name, m.discord_id as killer_discord_id
    FROM cemetery_kills k
    JOIN members m ON m.id = k.killer_id
    ORDER BY k.created_at DESC
    LIMIT $1
  `, [limit]);
  return res.rows;
}

async function publishKillToChannel(client, kill) {
  const channelId = CONFIG.CEMETERY_CHANNEL_ID;
  if (!channelId) return false;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return false;

  const killerMention = kill.killer?.discord_id ? `<@${kill.killer.discord_id}>` : kill.killer?.display_name || 'alguém';
  const victimStr = kill.victim_discord_id ? `<@${kill.victim_discord_id}>` : `**${kill.victim_name}**`;

  const embed = new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle('\u2620\uFE0F Nova entrada no cemitério')
    .setDescription(`${killerMention} matou ${victimStr}`)
    .addFields(
      ...(kill.context ? [{ name: 'Contexto', value: kill.context, inline: false }] : []),
      ...(kill.operation_id ? [{ name: 'Operação', value: `#${kill.operation_id}`, inline: true }] : []),
      { name: 'Data', value: String(kill.date).split('T')[0], inline: true },
    )
    .setFooter({ text: CONFIG.BOT_DISPLAY_NAME })
    .setTimestamp();

  await ch.send({ embeds: [embed] }).catch(() => null);
  return true;
}

module.exports = { recordKill, getLeaderboard, getRecent, publishKillToChannel };
