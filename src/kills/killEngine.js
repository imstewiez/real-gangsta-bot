'use strict';
/**
 * Kill engine — registo de kills (cemetery). Fonte de verdade: tabela
 * `kill_logs`. Kills podem estar ligadas a uma saída (saida_id) ou ser
 * standalone (ex.: registo defensivo no bairro).
 */

const { memberRepo, killRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const CONFIG = require('../config');
const { EmbedBuilder } = require('discord.js');

async function recordKill({ killerDiscordId, victimName, victimDiscordId = null, victimFaction = '', spot = '', context = '', saidaId = null, date = null, notes = '', confirmedBy = null, createdBy }) {
  if (!victimName?.trim()) throw new Error('Nome da vítima obrigatório.');

  const killer = await memberRepo.findByDiscordId(killerDiscordId);
  if (!killer) throw new Error('Killer não encontrado na base de membros.');

  const kill = await killRepo.recordKill({
    killerId: killer.id,
    victimName: victimName.trim(),
    victimDiscordId,
    victimFaction,
    spot,
    context,
    saidaId,
    date,
    notes,
    confirmedBy,
    createdBy,
  });

  await logAudit({
    action: 'kill_recorded',
    entityType: 'kill',
    entityId: String(kill.id),
    actorId: createdBy,
    afterState: { killer: killerDiscordId, victim: victimName, victimFaction, spot, saidaId },
  });

  return { ...kill, killer };
}

async function getLeaderboard(limit = 10, windowDays = null) {
  return killRepo.getLeaderboard(limit, windowDays);
}

async function getRecent(limit = 20) {
  return killRepo.getRecent(limit);
}

async function publishKillToChannel(client, kill) {
  const channelId = CONFIG.CEMETERY_CHANNEL_ID;
  if (!channelId) return false;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return false;

  const killerMention = kill.killer?.discord_id ? `<@${kill.killer.discord_id}>` : kill.killer?.display_name || 'alguém';
  const victimStr = kill.victim_discord_id ? `<@${kill.victim_discord_id}>` : `**${kill.victim_name}**`;

  const fields = [];
  if (kill.victim_faction) fields.push({ name: 'Facção', value: kill.victim_faction, inline: true });
  if (kill.spot) fields.push({ name: 'Spot', value: kill.spot, inline: true });
  if (kill.context) fields.push({ name: 'Contexto', value: kill.context, inline: false });
  if (kill.saida_id) fields.push({ name: 'Saída', value: `#${kill.saida_id}`, inline: true });
  fields.push({ name: 'Data', value: String(kill.date).split('T')[0], inline: true });

  const embed = new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle('☠️ Nova entrada no cemitério')
    .setDescription(`${killerMention} matou ${victimStr}`)
    .addFields(fields)
    .setFooter({ text: `— ${CONFIG.BOT_DISPLAY_NAME} ·` })
    .setTimestamp();

  await ch.send({ embeds: [embed] }).catch(() => null);
  return true;
}

module.exports = { recordKill, getLeaderboard, getRecent, publishKillToChannel };
