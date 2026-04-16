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

  const { brandEmbed } = require('../shared/embedBuilders');
  const { EMOJI, KILLS } = require('../content');

  const killerMention = kill.killer?.discord_id ? `<@${kill.killer.discord_id}>` : kill.killer?.display_name || 'alguém';
  const victimStr = kill.victim_discord_id ? `<@${kill.victim_discord_id}>` : `**${kill.victim_name}**`;

  const fields = [];
  if (kill.victim_faction) fields.push({ name: KILLS.LABELS.FACCAO, value: kill.victim_faction, inline: true });
  if (kill.spot)           fields.push({ name: KILLS.LABELS.SPOT,   value: kill.spot, inline: true });
  if (kill.saida_id)       fields.push({ name: KILLS.LABELS.SAIDA,  value: `#${kill.saida_id}`, inline: true });
  if (kill.context)        fields.push({ name: 'Contexto',          value: kill.context, inline: false });
  fields.push({ name: KILLS.LABELS.QUANDO, value: String(kill.date).split('T')[0], inline: true });

  const embed = brandEmbed('STREET')
    .setColor(0x2C2F33)
    .setTitle(`${EMOJI.MORTE} Nova entrada no cemitério`)
    .setDescription(`${killerMention} abateu ${victimStr}`)
    .addFields(fields);

  await ch.send({ embeds: [embed] }).catch(() => null);
  return true;
}

// Stats enriquecidos do killer: total, streak, weekly, rank.
// Usados no reply embed após registar kill (data-rich confirmation).
async function getKillerStats(killerDiscordId) {
  const { query } = require('../db');
  const member = await memberRepo.findByDiscordId(killerDiscordId);
  if (!member) return null;

  const [totalRow, weeklyRow, streakRow, leaderboard] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM kill_logs WHERE killer_id = $1`, [member.id]),
    query(`SELECT COUNT(*)::int AS n FROM kill_logs WHERE killer_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`, [member.id]),
    // Streak: contagem de kills consecutivas desde a última morte (death_logs).
    // Se não houver death_logs, retorna total. Graceful se tabela não existir.
    query(`
      SELECT COUNT(*)::int AS n FROM kill_logs
       WHERE killer_id = $1
         AND created_at > COALESCE((
           SELECT MAX(created_at) FROM kill_logs WHERE victim_discord_id = $2
         ), '1970-01-01'::timestamptz)
    `, [member.id, killerDiscordId]).catch(() => ({ rows: [{ n: 0 }] })),
    killRepo.getLeaderboard(100, null).catch(() => []),
  ]);

  const total   = totalRow.rows[0]?.n || 0;
  const weekly  = weeklyRow.rows[0]?.n || 0;
  const streak  = streakRow.rows[0]?.n || 0;
  const rank    = (leaderboard.findIndex(r => r.discord_id === killerDiscordId) + 1) || 0;

  return { total, weekly, streak, rank };
}

module.exports = { recordKill, getLeaderboard, getRecent, publishKillToChannel, getKillerStats };
