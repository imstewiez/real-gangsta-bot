'use strict';
/**
 * Kill engine — registo de kills (cemetery). Fonte de verdade: tabela
 * `kill_logs`. Kills podem estar ligadas a uma saída (saida_id) ou ser
 * standalone (ex.: registo defensivo no bairro).
 */

const { memberRepo, killRepo, saidaRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const CONFIG = require('../config');
// const { EmbedBuilder } = require('discord.js');
const eventBus = require('../core/eventBus');
const { warn } = require('../logger');

// Estados de saída em que é coerente registar kills.
const KILL_ALLOWED_SAIDA_STATUSES = new Set(['em_preparacao', 'em_curso', 'em_liquidacao', 'concluida']);

async function recordKill({
  killerDiscordId,
  victimName,
  victimDiscordId = null,
  victimFaction = '',
  spot = '',
  context = '',
  saidaId = null,
  date = null,
  notes = '',
  confirmedBy = null,
  createdBy,
}) {
  if (!victimName?.trim()) throw new Error('Nome da vítima obrigatório.');

  const killer = await memberRepo.findByDiscordId(killerDiscordId);
  if (!killer) throw new Error('Killer não encontrado na base de membros.');

  // Guards para kill com saidaId — standalone (saidaId=null) continua livre.
  if (saidaId !== null && saidaId !== undefined) {
    const saida = await saidaRepo.findById(saidaId);
    if (!saida) throw new Error(`Saída #${saidaId} não existe.`);

    // Guard 1: saída tem de estar iniciada ou concluída (kills em saída
    // 'aberta' ainda não arrancada são nonsense).
    if (!KILL_ALLOWED_SAIDA_STATUSES.has(saida.status)) {
      throw new Error(`Saída #${saidaId} está "${saida.status}" — não podem registar-se kills.`);
    }

    // Guard 2: killer tem de ser participante desta saída (atribuição
    // cruzada de kills entre saídas é data integrity violation).
    const participants = await saidaRepo.getParticipants(saidaId);
    const isParticipant = participants.some(p => p.member_id === killer.id);
    if (!isParticipant) {
      throw new Error(
        `${killer.display_name || 'Membro'} não é participante da saída #${saidaId}. Inscreve-te primeiro ou regista o kill sem saída.`
      );
    }
  }

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

  // Event bus — subscribers projectam para Sheets (Saídas & Combate).
  eventBus
    .emitAsync('kill.registered', {
      killId: kill.id,
      killerId: killer.id,
      killerDiscordId,
      victimName: victimName.trim(),
      victimDiscordId,
      victimFaction,
      spot,
      saidaId,
    })
    .catch(e => warn(`[EVENT] kill.registered: ${e.message}`));

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

  const { brandEmbed, COLOR } = require('../shared/embedBuilders');
  const { formatPtDateOnly } = require('../shared/formatPtDate');
  const { EMOJI, KILLS } = require('../content');

  const killerMention = kill.killer?.discord_id
    ? `<@${kill.killer.discord_id}>`
    : kill.killer?.display_name || 'alguém';
  const victimStr = kill.victim_discord_id ? `<@${kill.victim_discord_id}>` : `**${kill.victim_name}**`;

  const fields = [];
  if (kill.victim_faction) fields.push({ name: KILLS.LABELS.FACCAO, value: kill.victim_faction, inline: true });
  if (kill.spot) fields.push({ name: KILLS.LABELS.SPOT, value: kill.spot, inline: true });
  if (kill.saida_id) fields.push({ name: KILLS.LABELS.SAIDA, value: `#${kill.saida_id}`, inline: true });
  if (kill.context) fields.push({ name: 'Contexto', value: kill.context, inline: false });
  fields.push({ name: KILLS.LABELS.QUANDO, value: formatPtDateOnly(kill.date), inline: true });

  const embed = brandEmbed('STREET')
    .setColor(COLOR.DARK)
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
    query('SELECT COUNT(*)::int AS n FROM kill_logs WHERE killer_id = $1', [member.id]),
    query("SELECT COUNT(*)::int AS n FROM kill_logs WHERE killer_id = $1 AND created_at >= NOW() - INTERVAL '7 days'", [
      member.id,
    ]),
    // Streak: contagem de kills consecutivas desde a última morte (death_logs).
    // Se não houver death_logs, retorna total. Graceful se tabela não existir.
    query(
      `
      SELECT COUNT(*)::int AS n FROM kill_logs
       WHERE killer_id = $1
         AND created_at > COALESCE((
           SELECT MAX(created_at) FROM kill_logs WHERE victim_discord_id = $2
         ), '1970-01-01'::timestamptz)
    `,
      [member.id, killerDiscordId]
    ).catch(() => ({ rows: [{ n: 0 }] })),
    killRepo.getLeaderboard(100, null).catch(() => []),
  ]);

  const total = totalRow.rows[0]?.n || 0;
  const weekly = weeklyRow.rows[0]?.n || 0;
  const streak = streakRow.rows[0]?.n || 0;
  const rank = leaderboard.findIndex(r => r.discord_id === killerDiscordId) + 1 || 0;

  return { total, weekly, streak, rank };
}

module.exports = { recordKill, getLeaderboard, getRecent, publishKillToChannel, getKillerStats };
