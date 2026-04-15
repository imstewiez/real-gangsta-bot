'use strict';
/**
 * Handlers das fichas pessoais — performance, material, lucro.
 *
 * CustomIds:
 *   morador::my_performance   → combate (kills, K/D, sobrevivência, MVPs)
 *   morador::my_material      → material (recebido/devolvido/perdido, top items)
 *   morador::my_profit        → lucro + top spots + últimas saídas
 *
 * Todos ephemeral. Não assume que o membro tem registos — degrada graciosamente.
 */

const { MessageFlags } = require('discord.js');
const { memberAnalyticsRepo } = require('../repositories');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { MEMBER_STATS, EMOJI, RESULT_LABEL } = require('../content');

function fmtMoney(v) {
  const n = Number(v) || 0;
  return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} €`;
}

function fmtPct(v) {
  return `${(Number(v) || 0).toFixed(1)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().split('T')[0]; } catch { return String(d); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE / COMBATE
// ─────────────────────────────────────────────────────────────────────────────

async function handleMyPerformance(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const profile = await memberAnalyticsRepo.getCombatProfile(interaction.user.id);
  if (!profile || profile.saidasTotal === 0) {
    return safeReply(interaction, {
      embeds: [brandEmbed('MOVEMENT')
        .setTitle(MEMBER_STATS.COMBAT.TITLE)
        .setDescription(MEMBER_STATS.COMBAT.NO_DATA)],
    }, { dismissible: true });
  }

  const C = MEMBER_STATS.COMBAT;
  const embed = brandEmbed('MOVEMENT').setTitle(C.TITLE);

  embed.addFields(
    { name: C.SAIDAS,   value: String(profile.saidasTotal), inline: true },
    { name: C.WINS,     value: String(profile.wins),        inline: true },
    { name: C.LOSSES,   value: String(profile.losses),      inline: true },
    { name: C.KILLS,    value: String(profile.killsTotal),  inline: true },
    { name: C.DEATHS,   value: String(profile.deathsTotal), inline: true },
    { name: C.KD,       value: profile.kdRatio.toFixed(2),  inline: true },
    { name: C.SURVIVAL, value: fmtPct(profile.survivalRate), inline: true },
    { name: C.MVP,      value: String(profile.mvpCount),     inline: true },
    { name: C.WEEK_KILLS, value: String(profile.weekKills),  inline: true },
  );

  if (profile.killRank) {
    embed.addFields({ name: C.RANK, value: `#${profile.killRank}`, inline: true });
  }

  if (profile.lastKill) {
    const k = profile.lastKill;
    const parts = [k.victim_name || '?'];
    if (k.victim_faction) parts.push(k.victim_faction);
    if (k.spot) parts.push(`@ ${k.spot}`);
    parts.push(`(${fmtDate(k.created_at)})`);
    embed.addFields({ name: C.LAST_KILL, value: parts.join(' · '), inline: false });
  }

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL
// ─────────────────────────────────────────────────────────────────────────────

async function handleMyMaterial(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const profile = await memberAnalyticsRepo.getMaterialProfile(interaction.user.id);
  if (!profile || profile.fornecido.qty === 0) {
    return safeReply(interaction, {
      embeds: [brandEmbed()
        .setTitle(MEMBER_STATS.MATERIAL.TITLE)
        .setDescription(MEMBER_STATS.MATERIAL.NO_DATA)],
    }, { dismissible: true });
  }

  const M = MEMBER_STATS.MATERIAL;
  const embed = brandEmbed().setTitle(M.TITLE);

  const line = (obj) => `${obj.qty}× · ${fmtMoney(obj.value)}`;

  embed.addFields(
    { name: M.RECEBIDO,  value: line(profile.fornecido), inline: true },
    { name: M.DEVOLVIDO, value: line(profile.devolvido), inline: true },
    { name: M.PERDIDO,   value: line(profile.perdido),   inline: true },
    { name: M.CONSUMIDO, value: line(profile.consumido), inline: true },
    { name: M.RETURN_RATE, value: fmtPct(profile.returnRate), inline: true },
    { name: M.LOSS_RATE,   value: fmtPct(profile.lossRate),   inline: true },
  );

  if (profile.topItems?.length) {
    const items = profile.topItems.map(i => `• **${i.name}** — ${i.qty}×`).join('\n');
    embed.addFields({ name: M.TOP_ITEMS, value: items, inline: false });
  }

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// LUCRO + SPOTS + ÚLTIMAS SAÍDAS
// ─────────────────────────────────────────────────────────────────────────────

async function handleMyProfit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const profile = await memberAnalyticsRepo.getProfitProfile(interaction.user.id);
  if (!profile || profile.saidasTotal === 0) {
    return safeReply(interaction, {
      embeds: [brandEmbed('TOP')
        .setTitle(MEMBER_STATS.PROFIT.TITLE)
        .setDescription(MEMBER_STATS.PROFIT.NO_DATA)],
    }, { dismissible: true });
  }

  const P = MEMBER_STATS.PROFIT;
  const embed = brandEmbed('TOP').setTitle(P.TITLE);

  embed.addFields(
    { name: P.GENERATED, value: fmtMoney(profile.profitGenerated), inline: true },
    { name: P.SAIDAS,    value: String(profile.saidasTotal),       inline: true },
  );

  if (profile.topSpots?.length) {
    const lines = profile.topSpots.map((s, i) => {
      const prefix = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
      return `${prefix} **${s.spot}** — ${fmtMoney(s.net_delta)} · ${s.wins}W / ${s.saidas} saídas · ${s.kills} kills`;
    }).join('\n');
    embed.addFields({ name: P.TOP_SPOTS, value: lines, inline: false });
  }

  if (profile.recentSaidas?.length) {
    const lines = profile.recentSaidas.map(r => {
      const resultTag = RESULT_LABEL[r.result] || r.result || '—';
      const mvp = r.mvp_flag ? ` ${EMOJI.MVP}` : '';
      const death = r.died ? ` ${EMOJI.MORTE}` : '';
      return `\`${fmtDate(r.date)}\` **#${r.id}** ${r.spot || '—'} · ${resultTag} · ${r.kills || 0}k${death}${mvp}`;
    }).join('\n');
    embed.addFields({ name: P.RECENT, value: lines, inline: false });
  }

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = {
  handleMyPerformance,
  handleMyMaterial,
  handleMyProfit,
};
