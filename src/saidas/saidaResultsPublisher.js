'use strict';
/**
 * Publisher de resultados de saídas — 3 embeds ricos ao fecho:
 *   1. Resumo: spot, tipo, líder, inimigo, resultado, kills/mortes, lucro, material
 *   2. Destaques: MVP, kills por membro, mortos, quem devolveu, quem ficou a dever
 *   3. Impacto histórico: win/loss do spot, org kills totais, top killer, streaks
 *
 * Publica em CONFIG.SAIDA_RESULTS_CHANNEL_ID se definido; caso contrário
 * faz fallback para AUDIT_LOG_CHANNEL_ID. Sem canal, no-op silencioso.
 */

const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { saidaRepo, killRepo, spotStatsRepo, memberSaidaStatsRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { log, warn } = require('../logger');

const RESULT_META = {
  vitoria:      { emoji: '🏆', label: 'VITÓRIA',    color: 0x2ECC71 },
  derrota:      { emoji: '💀', label: 'DERROTA',    color: 0xE74C3C },
  empate:       { emoji: '🤝', label: 'EMPATE',     color: 0xF1C40F },
  sem_conflito: { emoji: '🕊️', label: 'SEM CONFLITO', color: 0x3498DB },
  abortada:     { emoji: '🚫', label: 'ABORTADA',   color: 0x95A5A6 },
};

const SAIDA_TYPE_LABEL = {
  craft: 'Craft', dominio: 'Domínio', ataque: 'Ataque',
  defesa: 'Defesa', recolha: 'Recolha', outra: 'Outra',
};

function formatMoney(v) {
  const n = Number(v) || 0;
  return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} €`;
}

function buildResumoEmbed(saida, participants) {
  const meta = RESULT_META[saida.result] || RESULT_META.sem_conflito;
  const type = SAIDA_TYPE_LABEL[saida.operation_type] || saida.operation_type;
  const profitTag = saida.was_profitable ? '📈 Lucro' : '📉 Prejuízo';

  const fields = [
    { name: 'Spot', value: saida.spot || '—', inline: true },
    { name: 'Tipo', value: type, inline: true },
    { name: 'Líder', value: saida.leader_name || '—', inline: true },
    { name: 'Data', value: String(saida.date).split('T')[0], inline: true },
    { name: 'Participantes', value: String(participants.length), inline: true },
    { name: 'Resultado', value: `${meta.emoji} **${meta.label}**`, inline: true },
  ];

  if (saida.had_fight) {
    const enemy = [saida.enemy_name, saida.enemy_faction].filter(Boolean).join(' · ') || '—';
    fields.push(
      { name: 'Inimigo', value: enemy, inline: true },
      { name: '🎯 Kills nossas', value: String(saida.our_kills || 0), inline: true },
      { name: '⚰️ Mortes nossas', value: String(saida.deaths || 0), inline: true },
    );
  }

  if (saida.had_craft) fields.push({ name: 'Craft', value: '✅', inline: true });
  if (saida.had_domination) fields.push({ name: 'Domínio', value: '✅', inline: true });

  fields.push(
    { name: '📦 Fornecido', value: formatMoney(saida.supplied_value), inline: true },
    { name: '↩️ Devolvido', value: formatMoney(saida.returned_value), inline: true },
    { name: '💥 Perdido',   value: formatMoney(saida.lost_value),     inline: true },
    { name: '🔥 Consumido', value: formatMoney(saida.consumed_value), inline: true },
    { name: '💰 Bruto',     value: formatMoney(saida.gross_value),    inline: true },
    { name: `💵 Líquido (${profitTag})`, value: formatMoney(saida.net_value), inline: true },
  );

  if (saida.result_notes) fields.push({ name: 'Notas', value: saida.result_notes.slice(0, 200), inline: false });

  return brandEmbed()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Saída #${saida.id} — ${meta.label}`)
    .addFields(fields);
}

function buildDestaquesEmbed(saida, participants) {
  const mvp = participants.find(p => p.mvp_flag);

  const killers = participants.filter(p => (p.kills || 0) > 0).sort((a, b) => b.kills - a.kills);
  const mortos = participants.filter(p => p.died);
  const devolveram = participants.filter(p => (p.returned_value || 0) > 0 && (p.issued_value || 0) > 0 && p.returned_value >= p.issued_value);
  const ficaramDevendo = participants.filter(p => (p.issued_value || 0) > (p.returned_value || 0) + (p.lost_value || 0) + (p.consumed_value || 0));

  const fmt = (p) => `<@${p.discord_id}> (${p.display_name})`;

  const fields = [];
  fields.push({
    name: '🏅 MVP',
    value: mvp
      ? `${fmt(mvp)} · ${mvp.kills || 0} kills · perf **${Math.round(mvp.performance_score)}** · disc **${Math.round(mvp.discipline_score)}%**`
      : '_(nenhum destaque)_',
    inline: false,
  });

  if (killers.length) {
    fields.push({
      name: '🎯 Kills por membro',
      value: killers.slice(0, 10).map(k => `• ${fmt(k)} — **${k.kills}** kill${k.kills === 1 ? '' : 's'}`).join('\n'),
      inline: false,
    });
  }
  if (mortos.length) {
    fields.push({
      name: '☠️ Morreram',
      value: mortos.map(m => `• ${fmt(m)}`).join('\n'),
      inline: false,
    });
  }
  if (devolveram.length) {
    fields.push({
      name: '✅ Devolveram tudo',
      value: devolveram.slice(0, 10).map(m => `• ${fmt(m)}`).join('\n'),
      inline: false,
    });
  }
  if (ficaramDevendo.length) {
    fields.push({
      name: '⚠️ Ficaram a dever',
      value: ficaramDevendo.slice(0, 10).map(m => `• ${fmt(m)} (${formatMoney(m.issued_value - m.returned_value - m.lost_value - m.consumed_value)})`).join('\n'),
      inline: false,
    });
  }

  return brandEmbed()
    .setColor(0xE67E22)
    .setTitle(`🌟 Destaques individuais — Saída #${saida.id}`)
    .addFields(fields.length ? fields : [{ name: '—', value: 'Sem destaques.' }]);
}

async function buildImpactoEmbed(saida) {
  const fields = [];
  if (saida.spot) {
    const ss = await spotStatsRepo.getBySpot(saida.spot);
    if (ss) {
      const winRate = ss.total_saidas > 0 ? Math.round((ss.wins / ss.total_saidas) * 100) : 0;
      fields.push({
        name: `📍 Spot "${saida.spot}"`,
        value: `${ss.total_saidas} saídas · ${ss.wins}W / ${ss.losses}L / ${ss.draws}D · winrate **${winRate}%** · net **${formatMoney(ss.total_net_value)}** · ${ss.our_kills} kills / ${ss.our_deaths} mortes`,
        inline: false,
      });
    }
  }

  const totalKills = await killRepo.totalOrgKills();
  fields.push({ name: '💀 Kills totais da org', value: String(totalKills), inline: true });

  const topKillers = await killRepo.getLeaderboard(3);
  if (topKillers.length) {
    fields.push({
      name: '👑 Top killers (all-time)',
      value: topKillers.map((k, i) => `${['🥇','🥈','🥉'][i]} <@${k.discord_id}> — ${k.kills}`).join('\n'),
      inline: false,
    });
  }

  const topProfit = await memberSaidaStatsRepo.listTop('profit_generated', 3);
  if (topProfit.length) {
    fields.push({
      name: '💰 Top lucro gerado',
      value: topProfit.map((m, i) => `${['🥇','🥈','🥉'][i]} <@${m.discord_id}> — ${formatMoney(m.profit_generated)}`).join('\n'),
      inline: false,
    });
  }

  return brandEmbed()
    .setColor(0x9B59B6)
    .setTitle('📈 Impacto histórico')
    .addFields(fields.length ? fields : [{ name: '—', value: 'Sem histórico suficiente.' }]);
}

async function publishResults(client, saidaId) {
  const channelId = CONFIG.SAIDA_RESULTS_CHANNEL_ID || CONFIG.AUDIT_LOG_CHANNEL_ID;
  if (!channelId) return { skipped: 'no_channel' };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return { skipped: 'no_channel_obj' };

  const saida = await saidaRepo.findById(saidaId);
  if (!saida) return { skipped: 'saida_not_found' };
  const participants = await saidaRepo.getParticipants(saidaId);

  try {
    const resumo = buildResumoEmbed(saida, participants);
    const destaques = buildDestaquesEmbed(saida, participants);
    const impacto = await buildImpactoEmbed(saida);
    await channel.send({ embeds: [resumo, destaques, impacto], allowedMentions: { parse: [] } });
    log(`[RESULTS] Saída #${saidaId} publicada em ${channel.id}.`);
    return { posted: true };
  } catch (e) {
    warn(`[RESULTS] publish falhou: ${e.message}`);
    return { skipped: 'error', reason: e.message };
  }
}

module.exports = { publishResults, buildResumoEmbed, buildDestaquesEmbed, buildImpactoEmbed };
