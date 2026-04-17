'use strict';
const { computeWeeklyRankings, getCurrentWeekRanking, getWeekSummary } = require('./rankingEngine');
const { rankingEmbed, brandEmbed } = require('../shared/embedBuilders');
const { weekBounds } = require('../util');
const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { jobRepo } = require('../repositories');

async function _countDiscordRoleMembers(guild, roleIds) {
  const ids = (roleIds || []).filter(Boolean);
  if (!ids.length || !guild) return 0;
  const seen = new Set();
  for (const roleId of ids) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    for (const [userId] of role.members) seen.add(userId);
  }
  return seen.size;
}

async function alreadyPublishedSince(jobName, sinceDate) {
  const recent = await jobRepo.getRecent(jobName, 50);
  return recent.some(
    r => r.status === 'completed' && r.result && r.result.published === true && new Date(r.started_at) >= sinceDate
  );
}

async function publishWeeklyTop(client) {
  if (!CONFIG.WEEKLY_TOP_CHANNEL_ID) return { skipped: 'no_channel' };

  const now = new Date();
  if (now.getDay() !== CONFIG.WEEKLY_TOP_DAY || now.getHours() !== CONFIG.WEEKLY_TOP_HOUR) {
    return { skipped: 'wrong_time' };
  }

  const { start, end } = weekBounds();
  if (await alreadyPublishedSince('weekly_rankings', start)) {
    return { skipped: 'already_published', weekStart: start.toISOString() };
  }

  try {
    await computeWeeklyRankings();

    const rankings = await getCurrentWeekRanking(10);
    const weekLabel = `${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`;

    // Delta vs semana anterior — mapa discordId → posição na semana anterior.
    let previousMap = null;
    try {
      const prevStart = new Date(start);
      prevStart.setUTCDate(prevStart.getUTCDate() - 7);
      const prevWeekStart = prevStart.toISOString().split('T')[0];
      const { rankingRepo } = require('../repositories');
      const prevRankings = await rankingRepo.getWeekRanking(prevWeekStart, 50);
      previousMap = new Map(prevRankings.map((r, i) => [r.discord_id, i + 1]));
    } catch (_) {
      /* sem delta */
    }

    const embed = rankingEmbed('Topo da Semana', rankings, weekLabel, { previousMap });

    const summary = await getWeekSummary();
    if (summary) {
      embed.addFields(
        { name: 'Entregas', value: `**${summary.total_deliveries || 0}**`, inline: true },
        { name: 'Vendas', value: `**${summary.total_sales || 0}**`, inline: true },
        { name: 'Saídas', value: `**${summary.total_operations || 0}**`, inline: true }
      );
    }

    const channel = await client.channels.fetch(CONFIG.WEEKLY_TOP_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [embed] });
      log('[RANKINGS] Top semanal publicado.');
      return { published: true, weekStart: start.toISOString() };
    }
    return { skipped: 'channel_unavailable' };
  } catch (e) {
    warn(`[RANKINGS] Falha ao publicar top semanal: ${e.message}`);
    throw e;
  }
}

async function publishDailySummary(client) {
  if (!CONFIG.DAILY_SUMMARY_CHANNEL_ID) return { skipped: 'no_channel' };

  const now = new Date();
  if (now.getHours() !== CONFIG.DAILY_SUMMARY_HOUR) {
    return { skipped: 'wrong_hour' };
  }

  const today = new Date().toISOString().split('T')[0];
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  if (await alreadyPublishedSince('daily_summary', startOfDay)) {
    return { skipped: 'already_published', date: today };
  }

  try {
    const { saidaRepo } = require('../repositories');

    const guild = CONFIG.DISCORD_GUILD_ID ? client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID) : null;
    if (guild) await guild.members.fetch().catch(() => null);

    const bairristaCount = await _countDiscordRoleMembers(guild, [
      ...CONFIG.BAIRRISTA_TIER_ROLE_IDS,
      ...CONFIG.PATRAO_DI_ZONA_ROLE_IDS,
    ]);
    const oficialCount = await _countDiscordRoleMembers(guild, [...CONFIG.OFICIAL_ROLE_IDS, ...CONFIG.CHEFIA_ROLE_IDS]);

    const todayOps = await saidaRepo.findByDate(today);
    const concluidas = todayOps.filter(o => o.status === 'concluida').length;
    const emCurso = todayOps.filter(o => ['aberta', 'em_preparacao', 'em_curso'].includes(o.status)).length;

    const killsRes = await query('SELECT COUNT(*)::int AS n FROM kill_logs WHERE date = $1', [today]);
    const killsToday = killsRes.rows[0]?.n || 0;

    const matRes = await query(
      `SELECT
         COUNT(*) FILTER (WHERE movement_type IN ('entrega_bairrista','entrega_morador'))::int AS entregas,
         COUNT(*) FILTER (WHERE movement_type IN ('venda_bairrista','venda_morador'))::int AS vendas,
         COALESCE(SUM(quantity) FILTER (WHERE movement_type IN ('entrega_bairrista','venda_bairrista','entrega_morador','venda_morador')), 0)::int AS qty
       FROM inventory_movements
       WHERE created_at::date = $1`,
      [today]
    );
    const mat = matRes.rows[0] || { entregas: 0, vendas: 0, qty: 0 };

    const embed = brandEmbed()
      .setTitle(`Resumo Diário — ${today}`)
      .addFields(
        { name: 'Bairristas', value: String(bairristaCount), inline: true },
        { name: 'Oficiais', value: String(oficialCount), inline: true },
        { name: 'Kills Hoje', value: String(killsToday), inline: true },
        {
          name: 'Saídas Hoje',
          value: `${todayOps.length} (${concluidas} fechadas · ${emCurso} em curso)`,
          inline: false,
        },
        {
          name: 'Material p/ Bairristas',
          value: `${mat.entregas} entregas · ${mat.vendas} vendas · ${mat.qty} unidades`,
          inline: false,
        }
      );

    if (todayOps.length > 0) {
      const opLines = todayOps.map(op => {
        const leader = op.leader_name ? ` · ${op.leader_name}` : '';
        return `#${op.id} — ${op.operation_type} (${op.status})${leader}`;
      });
      embed.addFields({ name: 'Saídas', value: opLines.join('\n').slice(0, 1024) });
    }

    const channel = await client.channels.fetch(CONFIG.DAILY_SUMMARY_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [embed] });
      log('[SUMMARY] Resumo diário publicado.');
      return { published: true, date: today };
    }
    return { skipped: 'channel_unavailable' };
  } catch (e) {
    warn(`[SUMMARY] Falha ao publicar resumo: ${e.message}`);
    throw e;
  }
}

module.exports = { publishWeeklyTop, publishDailySummary };
