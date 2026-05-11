'use strict';
/**
 * Publisher de resultados de saídas — embed rico ao fecho.
 *
 * Publica em CONFIG.SAIDA_RESULTS_CHANNEL_ID se definido; caso contrário
 * faz fallback para AUDIT_LOG_CHANNEL_ID. Sem canal, no-op silencioso.
 */

// const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { saidaRepo, killRepo, spotStatsRepo, memberSaidaStatsRepo, memberRepo } = require('../repositories');
const { brandEmbed, COLOR, progressBar, metricCard, rankBadge } = require('../shared/embedBuilders');
const { SAIDAS, EMOJI, SAIDA_TYPE } = require('../content');
const { formatPtDateOnly } = require('../shared/formatPtDate');
const { log, warn } = require('../logger');

const RESULT_META = {
  vitoria: { emoji: EMOJI.VITORIA, label: 'Vitória', color: COLOR.SUCCESS },
  derrota: { emoji: EMOJI.DERROTA, label: 'Derrota', color: COLOR.DANGER },
  empate: { emoji: EMOJI.EMPATE, label: 'Empate', color: COLOR.GOLD },
  sem_conflito: { emoji: EMOJI.INFO, label: 'Sem conflito', color: COLOR.INFO },
  abortada: { emoji: EMOJI.WARN, label: 'Abortada', color: COLOR.MUTED },
};

function formatMoney(v) {
  const n = Number(v) || 0;
  return `${Math.round(n).toLocaleString('pt-PT')}€`;
}

async function resolveLeaderName(saida) {
  if (saida.leader_name) return saida.leader_name;
  if (saida.created_by) {
    const creator = await memberRepo.findByDiscordId(saida.created_by).catch(() => null);
    if (creator) return creator.display_name || creator.username || `<@${saida.created_by}>`;
    return `<@${saida.created_by}>`;
  }
  return '—';
}

function formatEnemy(name, faction) {
  const n = (name || '').trim();
  const f = (faction || '').trim();
  if (!n && !f) return '—';
  if (!n) return f;
  if (!f) return n;
  if (n.toLowerCase() === f.toLowerCase()) return n;
  return `${n} · ${f}`;
}

function profitTag(net) {
  const n = Number(net) || 0;
  if (n > 0) return `${EMOJI.LUCRO} Lucro`;
  if (n < 0) return `${EMOJI.WARN} Prejuízo`;
  return `${EMOJI.INFO} Sem lucro`;
}

function _barLabel(current, max, width = 8) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return `${progressBar(current, max, { width })}  ${pct}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RESULT EMBED
// ═══════════════════════════════════════════════════════════════════════════

async function buildResumoEmbed(saida, participants) {
  const meta = RESULT_META[saida.result] || RESULT_META.sem_conflito;
  const type = SAIDA_TYPE[saida.operation_type] || saida.operation_type;
  const L = SAIDAS.LABELS;
  const characterized = participants.filter(p => p.participant_type === 'caracterizado');
  const workers = participants.filter(p => p.participant_type === 'trabalhador');
  const leaderName = await resolveLeaderName(saida);

  const embed = brandEmbed('MOVEMENT')
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Saída #${saida.id} — ${meta.label}`)
    .setDescription(
      `${EMOJI.ZONA} **${saida.spot || '—'}** · ${EMOJI.CALENDARIO} ${formatPtDateOnly(saida.date)}\n` +
        `${EMOJI.LIDER} ${leaderName} · ${type}${saida.had_fight ? ` · ${EMOJI.COMBATE} ${formatEnemy(saida.enemy_name, saida.enemy_faction)}` : ''}`
    );

  // ── Métricas principais (inline cards) ──────────────────────────────────
  const totalKills = participants.reduce((a, p) => a + Number(p.kills || 0), 0);
  const totalDeaths = participants.filter(p => p.died).length;
  const vivos = participants.length - totalDeaths;

  if (saida.had_fight) {
    embed.addFields(
      metricCard(`${EMOJI.KILL} Kills`, totalKills, { icon: EMOJI.KILL, inline: true }),
      metricCard(`${EMOJI.MORTE} Mortes`, totalDeaths, { icon: EMOJI.MORTE, inline: true }),
      metricCard(`${EMOJI.OK} Vivos`, vivos, { icon: EMOJI.OK, inline: true })
    );
  }

  // ── Participantes (lista compacta com medalhas) ─────────────────────────
  const mvp = participants.find(p => p.mvp_flag);
  const sortedParts = [...participants].sort((a, b) => {
    if (a.mvp_flag && !b.mvp_flag) return -1;
    if (b.mvp_flag && !a.mvp_flag) return 1;
    const ak = Number(a.kills || 0);
    const bk = Number(b.kills || 0);
    if (ak !== bk) return bk - ak;
    return String(a.display_name || '').localeCompare(String(b.display_name || ''));
  });

  if (sortedParts.length) {
    const maxKills = Math.max(1, ...sortedParts.map(p => Number(p.kills || 0)));
    const lines = sortedParts.map((p, i) => {
      const tag = p.participant_type === 'trabalhador' ? EMOJI.TRABALHADOR : EMOJI.ARMA;
      const kills = Number(p.kills || 0);
      const killsBar = kills > 0 ? `  ${progressBar(kills, maxKills, { width: 6 })}` : '';
      const status = p.died ? EMOJI.MORTE : EMOJI.OK;
      const mvpBadge = p.mvp_flag ? ` ${EMOJI.MVP}` : '';
      const medal = i < 3 && kills > 0 ? rankBadge(i + 1) : '•';
      return `${medal} ${tag} <@${p.discord_id}>${mvpBadge}  ${status}  ${kills > 0 ? `**${kills}**k` : '0k'}${killsBar}`;
    });

    embed.addFields({
      name: `${EMOJI.PARTICIPANTE} Participantes  (${characterized.length}c · ${workers.length}t)`,
      value: lines.join('\n').slice(0, 1020),
      inline: false,
    });
  }

  // ── Material & Lucro ────────────────────────────────────────────────────
  const materialLines = [];
  if (Number(saida.supplied_value || 0) > 0) {
    materialLines.push(`${EMOJI.MATERIAL} Fornecido: **${formatMoney(saida.supplied_value)}**`);
  }
  if (Number(saida.returned_value || 0) > 0) {
    materialLines.push(`${EMOJI.DEVOLVER} Devolvido: **${formatMoney(saida.returned_value)}**`);
  }
  if (Number(saida.lost_value || 0) > 0) {
    materialLines.push(`${EMOJI.PERDIDO} Perdido: **${formatMoney(saida.lost_value)}**`);
  }
  if (saida.had_craft && (saida.craft_amount || 0) > 0) {
    materialLines.push(`${EMOJI.CRAFT} Craftado: **${saida.craft_amount}** un.`);
  }
  if (materialLines.length) {
    embed.addFields({ name: `${EMOJI.MATERIAL} Material`, value: materialLines.join('\n'), inline: false });
  }

  // Lucro líquido — card visual
  const net = Number(saida.net_value) || 0;
  embed.addFields({
    name: `${EMOJI.DINHEIRO} ${L.LUCRO_LIQUIDO}`,
    value: `### ${formatMoney(net)}\n${profitTag(net)}`,
    inline: false,
  });

  // ── MVP com progress bars ───────────────────────────────────────────────
  if (mvp) {
    const kScore = Math.round(mvp.performance_score || 0);
    const dScore = Math.round(mvp.discipline_score || 0);
    embed.addFields({
      name: `${EMOJI.MVP} MVP — <@${mvp.discord_id}>`,
      value:
        `${mvp.kills || 0} kills · peso **${kScore}**/100  ${_barLabel(kScore, 100, 6)}\n` +
        `disciplina **${dScore}%**  ${_barLabel(dScore, 100, 6)}`,
      inline: false,
    });
  }

  // ── Impacto histórico ───────────────────────────────────────────────────
  const impactLines = [];
  if (saida.spot) {
    const ss = await spotStatsRepo.getBySpot(saida.spot).catch(() => null);
    if (ss && ss.total_saidas > 0) {
      const winRate = Math.round((ss.wins / ss.total_saidas) * 100);
      impactLines.push(
        `${EMOJI.ZONA} Spot **${saida.spot}**: ${ss.total_saidas} saídas · ${ss.wins}W/${ss.losses}L/${ss.draws}D · **${winRate}%** WR · net ${formatMoney(ss.total_net_value)}`
      );
    }
  }
  const topKillers = await killRepo.getLeaderboard(3).catch(() => []);
  if (topKillers.length) {
    impactLines.push(
      `🎯 Top killers: ${topKillers.map((k, i) => `${rankBadge(i + 1)} <@${k.discord_id}> (${k.kills})`).join(' · ')}`
    );
  }
  if (impactLines.length) {
    embed.addFields({
      name: `${EMOJI.GRAFICO} Impacto histórico`,
      value: impactLines.join('\n').slice(0, 1020),
      inline: false,
    });
  }

  // Notas — opcional, último.
  if (saida.result_notes) {
    embed.addFields({ name: `${EMOJI.AUDIT} Notas`, value: saida.result_notes.slice(0, 500), inline: false });
  }

  return embed;
}

// ═══════════════════════════════════════════════════════════════════════════
// DESTAQUES E IMPACTO (legacy — mantidos para possível uso futuro)
// ═══════════════════════════════════════════════════════════════════════════

function buildDestaquesEmbed(saida, participants) {
  const mvp = participants.find(p => p.mvp_flag);
  const killers = participants.filter(p => (p.kills || 0) > 0).sort((a, b) => b.kills - a.kills);
  const mortos = participants.filter(p => p.died);
  const sobreviventes = participants.filter(p => !p.died);
  const devolveram = participants.filter(
    p => (p.returned_value || 0) > 0 && (p.issued_value || 0) > 0 && p.returned_value >= p.issued_value
  );
  const ficaramDevendo = participants.filter(
    p => (p.issued_value || 0) > (p.returned_value || 0) + (p.lost_value || 0) + (p.consumed_value || 0)
  );
  const totalKills = participants.reduce((a, p) => a + (p.kills || 0), 0);

  const fmt = p => {
    const typeTag = p.participant_type === 'trabalhador' ? ` ${EMOJI.CRAFT}` : '';
    return `<@${p.discord_id}>${typeTag}`;
  };
  const L = SAIDAS.LABELS;

  const fields = [];
  fields.push({
    name: `${EMOJI.COMBATE} Resumo de combate`,
    value: `**${totalKills}** kills · **${mortos.length}** mortes · **${sobreviventes.length}** vivos · **${participants.length}** participantes`,
    inline: false,
  });

  fields.push({
    name: `${EMOJI.MVP} ${L.MVP}`,
    value: mvp
      ? `${fmt(mvp)} · **${mvp.kills || 0}** kills · peso **${Math.round(mvp.performance_score)}** · disciplina **${Math.round(mvp.discipline_score)}%**`
      : '_(sem destaque)_',
    inline: false,
  });

  if (killers.length) {
    fields.push({
      name: `${EMOJI.KILL} Kills por nome`,
      value: killers
        .slice(0, 10)
        .map((k, i) => {
          const medal = rankBadge(i + 1);
          return `${medal} ${fmt(k)} — **${k.kills}** kill${k.kills === 1 ? '' : 's'}`;
        })
        .join('\n'),
      inline: false,
    });
  }
  if (mortos.length) {
    fields.push({
      name: `${EMOJI.MORTE} ${L.MORTOS} (${mortos.length})`,
      value: mortos.map(m => `• ${fmt(m)}`).join('\n'),
      inline: false,
    });
  }
  if (devolveram.length) {
    fields.push({
      name: `${EMOJI.OK} ${L.DEVOLVERAM} (${devolveram.length})`,
      value: devolveram
        .slice(0, 10)
        .map(m => `• ${fmt(m)}`)
        .join('\n'),
      inline: false,
    });
  }
  if (ficaramDevendo.length) {
    fields.push({
      name: `${EMOJI.WARN} ${L.DEVENDO} (${ficaramDevendo.length})`,
      value: ficaramDevendo
        .slice(0, 10)
        .map(m => `• ${fmt(m)} (${formatMoney(m.issued_value - m.returned_value - m.lost_value - m.consumed_value)})`)
        .join('\n'),
      inline: false,
    });
  }

  return brandEmbed('MOVEMENT')
    .setColor(COLOR.WARNING)
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

  const totalKills = await killRepo.totalOrgKillsAllSources();
  fields.push({ name: `${EMOJI.DERROTA} ${L.ORG_KILLS}`, value: String(totalKills), inline: true });

  const topKillers = await killRepo.getLeaderboard(3);
  if (topKillers.length) {
    fields.push({
      name: `${EMOJI.LIDER} Top killers (all-time)`,
      value: topKillers.map((k, i) => `${rankBadge(i + 1)} <@${k.discord_id}> — ${k.kills}`).join('\n'),
      inline: false,
    });
  }

  const topProfit = await memberSaidaStatsRepo.listTop('profit_generated', 3);
  const profitSignal = topProfit.filter(m => Number(m.profit_generated) > 0);
  if (profitSignal.length) {
    fields.push({
      name: `${EMOJI.LUCRO} Top lucro gerado`,
      value: profitSignal
        .map((m, i) => `${rankBadge(i + 1)} <@${m.discord_id}> — ${formatMoney(m.profit_generated)}`)
        .join('\n'),
      inline: false,
    });
  }

  return brandEmbed('TOP')
    .setColor(COLOR.PURPLE)
    .setTitle(SAIDAS.IMPACTO_TITLE)
    .addFields(fields.length ? fields : [{ name: '—', value: 'Sem histórico suficiente.' }]);
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH
// ═══════════════════════════════════════════════════════════════════════════

async function publishResults(client, saidaId) {
  const channelId = CONFIG.SAIDA_RESULTS_CHANNEL_ID || CONFIG.AUDIT_LOG_CHANNEL_ID;
  if (!channelId) return { skipped: 'no_channel' };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return { skipped: 'no_channel_obj' };

  const saida = await saidaRepo.findById(saidaId);
  if (!saida) return { skipped: 'saida_not_found' };
  const participants = await saidaRepo.getParticipants(saidaId);

  try {
    const resumo = await buildResumoEmbed(saida, participants);
    await channel.send({ embeds: [resumo], allowedMentions: { parse: [] } });
    log(`[RESULTS] Saída #${saidaId} publicada em ${channel.id}.`);
    return { posted: true };
  } catch (e) {
    warn(`[RESULTS] publish falhou: ${e.message}`);
    return { skipped: 'error', reason: e.message };
  }
}

module.exports = { publishResults, buildResumoEmbed, buildDestaquesEmbed, buildImpactoEmbed };
