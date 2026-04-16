'use strict';
/**
 * Publisher de resultados de saídas — 3 embeds ricos ao fecho:
 *   1. Resumo: spot, tipo, líder, inimigo, resultado, kills/mortes, lucro, material
 *   2. Destaques: MVP, kills por nome, mortos, quem devolveu, quem ficou a dever
 *   3. Impacto histórico: winrate do spot, kills da firma, topo, streaks
 *
 * Publica em CONFIG.SAIDA_RESULTS_CHANNEL_ID se definido; caso contrário
 * faz fallback para AUDIT_LOG_CHANNEL_ID. Sem canal, no-op silencioso.
 */

const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { saidaRepo, killRepo, spotStatsRepo, memberSaidaStatsRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { SAIDAS, EMOJI, SAIDA_TYPE } = require('../content');
const { log, warn } = require('../logger');

const RESULT_META = {
  vitoria:      { emoji: EMOJI.VITORIA, label: 'Vitória',      color: 0x2ECC71 },
  derrota:      { emoji: EMOJI.DERROTA, label: 'Derrota',      color: 0xE74C3C },
  empate:       { emoji: EMOJI.EMPATE,  label: 'Empate',       color: 0xF1C40F },
  sem_conflito: { emoji: EMOJI.INFO,    label: 'Sem conflito', color: 0x3498DB },
  abortada:     { emoji: EMOJI.WARN,    label: 'Abortada',     color: 0x95A5A6 },
};

function formatMoney(v) {
  const n = Number(v) || 0;
  return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} €`;
}

function buildResumoEmbed(saida, participants) {
  const meta = RESULT_META[saida.result] || RESULT_META.sem_conflito;
  const type = SAIDA_TYPE[saida.operation_type] || saida.operation_type;
  const profitTag = saida.was_profitable ? `${EMOJI.LUCRO} Lucro` : `${EMOJI.WARN} Prejuízo`;

  const L = SAIDAS.LABELS;
  const characterized = participants.filter(p => p.participant_type === 'caracterizado');
  const workers = participants.filter(p => p.participant_type === 'trabalhador');
  const ownWeaponCount = participants.filter(p => p.own_weapon).length;

  const fields = [
    { name: L.SPOT, value: saida.spot || '—', inline: true },
    { name: L.TIPO, value: type, inline: true },
    { name: L.LIDER, value: saida.leader_name || '—', inline: true },
    { name: 'Data', value: String(saida.date).split('T')[0], inline: true },
    { name: 'Na saída', value: `**${participants.length}** (${characterized.length} caract. · ${workers.length} trab.)`, inline: true },
    { name: L.RESULTADO, value: `${meta.emoji} **${meta.label}**`, inline: true },
  ];

  if (ownWeaponCount > 0) {
    fields.push({ name: '🔫 Arma própria', value: String(ownWeaponCount), inline: true });
  }

  if (saida.had_fight) {
    const enemy = [saida.enemy_name, saida.enemy_faction].filter(Boolean).join(' · ') || '—';
    fields.push(
      { name: L.INIMIGO, value: enemy, inline: true },
      { name: `${EMOJI.KILL} ${L.KILLS}`, value: String(saida.our_kills || 0), inline: true },
      { name: `${EMOJI.MORTE} ${L.MORTES}`, value: String(saida.deaths || 0), inline: true },
    );
  }

  if (saida.had_craft) {
    const craftUnits = saida.craft_amount || 0;
    fields.push({ name: `${EMOJI.CRAFT} Craftado`, value: `**${craftUnits}** unidades`, inline: true });
  }
  if (saida.had_domination) fields.push({ name: 'Domínio', value: EMOJI.OK, inline: true });

  fields.push(
    { name: `${EMOJI.MATERIAL} ${L.MATERIAL_FORNECIDO}`, value: formatMoney(saida.supplied_value), inline: true },
    { name: `${EMOJI.DEVOLVER} ${L.MATERIAL_DEVOLVIDO}`, value: formatMoney(saida.returned_value), inline: true },
    { name: `${EMOJI.PERDIDO} ${L.MATERIAL_PERDIDO}`,    value: formatMoney(saida.lost_value),     inline: true },
    { name: `${EMOJI.CRAFT} Consumido`,                   value: formatMoney(saida.consumed_value), inline: true },
    { name: `${EMOJI.LUCRO} ${L.LUCRO_BRUTO}`,            value: formatMoney(saida.gross_value),    inline: true },
    { name: `${EMOJI.DINHEIRO} ${L.LUCRO_LIQUIDO} (${profitTag})`, value: formatMoney(saida.net_value), inline: true },
  );

  if (saida.result_notes) fields.push({ name: 'Notas', value: saida.result_notes.slice(0, 200), inline: false });

  return brandEmbed('MOVEMENT')
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

  const fmt = (p) => {
    const typeTag = p.participant_type === 'trabalhador' ? ' 🛠️' : '';
    return `<@${p.discord_id}>${typeTag}`;
  };
  const L = SAIDAS.LABELS;

  const fields = [];
  fields.push({
    name: `${EMOJI.MVP} ${L.MVP}`,
    value: mvp
      ? `${fmt(mvp)} · ${mvp.kills || 0} kills · peso **${Math.round(mvp.performance_score)}** · disciplina **${Math.round(mvp.discipline_score)}%**`
      : '_(sem destaque)_',
    inline: false,
  });

  if (killers.length) {
    fields.push({
      name: `${EMOJI.KILL} Kills por nome`,
      value: killers.slice(0, 10).map(k => `• ${fmt(k)} — **${k.kills}** kill${k.kills === 1 ? '' : 's'}`).join('\n'),
      inline: false,
    });
  }
  if (mortos.length) {
    fields.push({
      name: `${EMOJI.MORTE} ${L.MORTOS}`,
      value: mortos.map(m => `• ${fmt(m)}`).join('\n'),
      inline: false,
    });
  }
  if (devolveram.length) {
    fields.push({
      name: `${EMOJI.OK} ${L.DEVOLVERAM}`,
      value: devolveram.slice(0, 10).map(m => `• ${fmt(m)}`).join('\n'),
      inline: false,
    });
  }
  if (ficaramDevendo.length) {
    fields.push({
      name: `${EMOJI.WARN} ${L.DEVENDO}`,
      value: ficaramDevendo.slice(0, 10).map(m => `• ${fmt(m)} (${formatMoney(m.issued_value - m.returned_value - m.lost_value - m.consumed_value)})`).join('\n'),
      inline: false,
    });
  }

  return brandEmbed('MOVEMENT')
    .setColor(0xE67E22)
    .setTitle(`${EMOJI.MVP} ${SAIDAS.DESTAQUES_TITLE} — Saída #${saida.id}`)
    .addFields(fields.length ? fields : [{ name: '—', value: 'Sem destaques.' }]);
}

async function buildImpactoEmbed(saida) {
  const fields = [];
  const L = SAIDAS.LABELS;
  if (saida.spot) {
    const ss = await spotStatsRepo.getBySpot(saida.spot);
    if (ss) {
      const winRate = ss.total_saidas > 0 ? Math.round((ss.wins / ss.total_saidas) * 100) : 0;
      fields.push({
        name: `${EMOJI.ZONA} Spot "${saida.spot}"`,
        value: `${ss.total_saidas} saídas · ${ss.wins}W / ${ss.losses}L / ${ss.draws}D · winrate **${winRate}%** · net **${formatMoney(ss.total_net_value)}** · ${ss.our_kills} kills / ${ss.our_deaths} mortes`,
        inline: false,
      });
    }
  }

  const totalKills = await killRepo.totalOrgKills();
  fields.push({ name: `${EMOJI.DERROTA} ${L.ORG_KILLS}`, value: String(totalKills), inline: true });

  const medals = [EMOJI.MEDAL_1, EMOJI.MEDAL_2, EMOJI.MEDAL_3];

  const topKillers = await killRepo.getLeaderboard(3);
  if (topKillers.length) {
    fields.push({
      name: `${EMOJI.LIDER} Top killers (all-time)`,
      value: topKillers.map((k, i) => `${medals[i]} <@${k.discord_id}> — ${k.kills}`).join('\n'),
      inline: false,
    });
  }

  const topProfit = await memberSaidaStatsRepo.listTop('profit_generated', 3);
  if (topProfit.length) {
    fields.push({
      name: `${EMOJI.LUCRO} Top lucro gerado`,
      value: topProfit.map((m, i) => `${medals[i]} <@${m.discord_id}> — ${formatMoney(m.profit_generated)}`).join('\n'),
      inline: false,
    });
  }

  return brandEmbed('TOP')
    .setColor(0x9B59B6)
    .setTitle(SAIDAS.IMPACTO_TITLE)
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
