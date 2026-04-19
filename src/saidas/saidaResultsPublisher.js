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
const { saidaRepo, killRepo, spotStatsRepo, memberSaidaStatsRepo, memberRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { SAIDAS, EMOJI, SAIDA_TYPE } = require('../content');
const { formatPtDateOnly } = require('../shared/formatPtDate');
const { log, warn } = require('../logger');

const RESULT_META = {
  vitoria: { emoji: EMOJI.VITORIA, label: 'Vitória', color: 0x2ecc71 },
  derrota: { emoji: EMOJI.DERROTA, label: 'Derrota', color: 0xe74c3c },
  empate: { emoji: EMOJI.EMPATE, label: 'Empate', color: 0xf1c40f },
  sem_conflito: { emoji: EMOJI.INFO, label: 'Sem conflito', color: 0x3498db },
  abortada: { emoji: EMOJI.WARN, label: 'Abortada', color: 0x95a5a6 },
};

function formatMoney(v) {
  const n = Number(v) || 0;
  return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} €`;
}

// Resolve o nome do líder com fallback ao creator (quem criou a saída).
// Antes mostrava "—" se leader_id era null; agora cai para o creator.
async function resolveLeaderName(saida) {
  if (saida.leader_name) return saida.leader_name;
  if (saida.created_by) {
    const creator = await memberRepo.findByDiscordId(saida.created_by).catch(() => null);
    if (creator) return creator.display_name || creator.username || `<@${saida.created_by}>`;
    return `<@${saida.created_by}>`;
  }
  return '—';
}

// Formata o field de inimigo — dedupa quando name===faction (comum: o modal
// preenche os dois campos com o mesmo input).
function formatEnemy(name, faction) {
  const n = (name || '').trim();
  const f = (faction || '').trim();
  if (!n && !f) return '—';
  if (!n) return f;
  if (!f) return n;
  if (n.toLowerCase() === f.toLowerCase()) return n; // dedup
  return `${n} · ${f}`;
}

// Tag tri-state para net_value: lucro / empate / prejuízo. Antes
// mostrava sempre "Prejuízo" quando net=0.
function profitTag(net) {
  const n = Number(net) || 0;
  if (n > 0) return `${EMOJI.LUCRO} Lucro`;
  if (n < 0) return `${EMOJI.WARN} Prejuízo`;
  return `${EMOJI.INFO} Sem lucro`;
}

async function buildResumoEmbed(saida, participants) {
  const meta = RESULT_META[saida.result] || RESULT_META.sem_conflito;
  const type = SAIDA_TYPE[saida.operation_type] || saida.operation_type;

  const L = SAIDAS.LABELS;
  const characterized = participants.filter(p => p.participant_type === 'caracterizado');
  const workers = participants.filter(p => p.participant_type === 'trabalhador');
  const ownWeaponCount = participants.filter(p => p.own_weapon).length;
  const leaderName = await resolveLeaderName(saida);

  const fields = [
    { name: L.SPOT, value: saida.spot || '—', inline: true },
    { name: L.TIPO, value: type, inline: true },
    { name: L.LIDER, value: leaderName, inline: true },
    { name: 'Data', value: formatPtDateOnly(saida.date), inline: true },
    {
      name: 'Na saída',
      value: `**${participants.length}** (${characterized.length} caract. · ${workers.length} trab.)`,
      inline: true,
    },
    { name: L.RESULTADO, value: `${meta.emoji} **${meta.label}**`, inline: true },
  ];

  if (ownWeaponCount > 0) {
    fields.push({ name: '🔫 Arma própria', value: String(ownWeaponCount), inline: true });
  }

  if (saida.had_fight) {
    fields.push(
      { name: L.INIMIGO, value: formatEnemy(saida.enemy_name, saida.enemy_faction), inline: true },
      { name: `${EMOJI.KILL} ${L.KILLS}`, value: String(saida.our_kills || 0), inline: true },
      { name: `${EMOJI.MORTE} ${L.MORTES}`, value: String(saida.deaths || 0), inline: true }
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
    { name: `${EMOJI.PERDIDO} ${L.MATERIAL_PERDIDO}`, value: formatMoney(saida.lost_value), inline: true },
    { name: `${EMOJI.CRAFT} Consumido`, value: formatMoney(saida.consumed_value), inline: true },
    { name: `${EMOJI.LUCRO} ${L.LUCRO_BRUTO}`, value: formatMoney(saida.gross_value), inline: true },
    {
      name: `${EMOJI.DINHEIRO} ${L.LUCRO_LIQUIDO} (${profitTag(saida.net_value)})`,
      value: formatMoney(saida.net_value),
      inline: true,
    }
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
  const sobreviventes = participants.filter(p => !p.died);
  const devolveram = participants.filter(
    p => (p.returned_value || 0) > 0 && (p.issued_value || 0) > 0 && p.returned_value >= p.issued_value
  );
  const ficaramDevendo = participants.filter(
    p => (p.issued_value || 0) > (p.returned_value || 0) + (p.lost_value || 0) + (p.consumed_value || 0)
  );
  const totalKills = participants.reduce((a, p) => a + (p.kills || 0), 0);

  const fmt = p => {
    const typeTag = p.participant_type === 'trabalhador' ? ' 🛠️' : '';
    return `<@${p.discord_id}>${typeTag}`;
  };
  const L = SAIDAS.LABELS;

  const fields = [];

  // Resumo rápido
  fields.push({
    name: `${EMOJI.COMBATE} Resumo de combate`,
    value: `**${totalKills}** kills · **${mortos.length}** mortes · **${sobreviventes.length}** vivos · **${participants.length}** participantes`,
    inline: false,
  });

  // MVP
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
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
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
    .setColor(0xe67e22)
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

  // Kills da firma all-time = /kill events + kills em saídas (agregado).
  // Antes só contava /kill — ficava 0 se ninguém tivesse usado o slash.
  const totalKills = await killRepo.totalOrgKillsAllSources();
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
  // Só mostrar se pelo menos um tem valor > 0 — evita rank de 0€×3 (ruído).
  const profitSignal = topProfit.filter(m => Number(m.profit_generated) > 0);
  if (profitSignal.length) {
    fields.push({
      name: `${EMOJI.LUCRO} Top lucro gerado`,
      value: profitSignal
        .map((m, i) => `${medals[i]} <@${m.discord_id}> — ${formatMoney(m.profit_generated)}`)
        .join('\n'),
      inline: false,
    });
  }

  return brandEmbed('TOP')
    .setColor(0x9b59b6)
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
    // Single-embed output — reduzido de 3 embeds (resumo + destaques + impacto)
    // para 1 embed compacto. Spam control: painel vivo da saída já cobre
    // estado operacional; este é o arquivo/relatório pós-mortem.
    // Destaques e impacto all-time ficam disponíveis noutros canais (ranking,
    // analytics) — não poluem o canal operacional.
    const resumo = await buildResumoEmbed(saida, participants);
    await channel.send({ embeds: [resumo], allowedMentions: { parse: [] } });
    log(`[RESULTS] Saída #${saidaId} publicada em ${channel.id} (1 embed compacto).`);
    return { posted: true };
  } catch (e) {
    warn(`[RESULTS] publish falhou: ${e.message}`);
    return { skipped: 'error', reason: e.message };
  }
}

module.exports = { publishResults, buildResumoEmbed, buildDestaquesEmbed, buildImpactoEmbed };
