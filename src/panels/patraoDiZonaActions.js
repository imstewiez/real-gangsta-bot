'use strict';
/**
 * Patrão di Zona panel — acções de botão do painel `patrao::*`.
 *
 *   - listar_bairristas — lista bairristas activos c/ stats semanais
 *   - ver_entregas      — top de entregas por bairrista
 *   - ver_vendas        — top de vendas por bairrista
 *   - ver_tops          — top semanal dos bairristas
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, rankingEmbed, COLOR } = require('../shared/embedBuilders');
const { ERRORS } = require('../content');
const { isPatraoDiZona } = require('../permissions/permissionEngine');
const { DELIVERY_TYPES, SALE_TYPES } = require('../shared/movementTypes');
const { query } = require('../db');
const { weekBounds } = require('../util');
const { formatPtDateOnly } = require('../shared/formatPtDate');

// ── Helpers ─────────────────────────────────────────────────────────────────

const TIER_ABBR = {
  young_blood: 'YB',
  o_gunao: 'OG',
  gangster_fodido: 'GF',
};

const TIER_EMOJI = {
  young_blood: '🩸',
  o_gunao: '🔫',
  gangster_fodido: '👑',
};

function truncateName(name = '', max = 13) {
  const s = String(name).trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function fmtNum(n) {
  const num = Number(n) || 0;
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

function daysAgo(dateOrNull) {
  if (!dateOrNull) return 'nunca';
  const ts = new Date(dateOrNull).getTime();
  if (!Number.isFinite(ts)) return '?';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}s`;
  return `${Math.floor(days / 30)}m`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Listar Bairristas — vista rica para patrões de zona
// ══════════════════════════════════════════════════════════════════════════════

async function listarBairristas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('listar bairristas'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { start, end } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  const weekEnd = end.toISOString();

  // Query agregada: membros + stats semanais + stats all-time + última actividade
  const res = await query(
    `
    WITH bairristas AS (
      SELECT id, discord_id, display_name, tier, joined_at
      FROM members
      WHERE role = 'bairrista' AND status = 'ativo'
    ),
    weekly_deliveries AS (
      SELECT member_id, SUM(quantity)::int AS total
      FROM inventory_movements
      WHERE movement_type = ANY($1)
        AND created_at >= $2 AND created_at < $3
      GROUP BY member_id
    ),
    weekly_sales AS (
      SELECT member_id, SUM(quantity)::int AS total
      FROM inventory_movements
      WHERE movement_type = ANY($4)
        AND created_at >= $2 AND created_at < $3
      GROUP BY member_id
    ),
    weekly_rank AS (
      SELECT member_id, GREATEST(hybrid_score, weighted_value) AS score,
             ROW_NUMBER() OVER (ORDER BY GREATEST(hybrid_score, weighted_value) DESC) AS pos
      FROM weekly_rankings
      WHERE week_start = $5
    ),
    total_deliveries AS (
      SELECT member_id, SUM(quantity)::int AS total
      FROM inventory_movements
      WHERE movement_type = ANY($1)
      GROUP BY member_id
    ),
    last_delivery AS (
      SELECT member_id, MAX(created_at)::date AS last_at
      FROM inventory_movements
      WHERE movement_type = ANY($1)
      GROUP BY member_id
    ),
    last_saida AS (
      SELECT op.member_id, MAX(o.date) AS last_at
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
      GROUP BY op.member_id
    )
    SELECT
      b.id,
      b.discord_id,
      b.display_name,
      b.tier,
      b.joined_at,
      COALESCE(wd.total, 0) AS deliveries_week,
      COALESCE(ws.total, 0) AS sales_week,
      COALESCE(td.total, 0) AS deliveries_total,
      COALESCE(ld.last_at, NULL) AS last_delivery,
      COALESCE(ls.last_at, NULL) AS last_saida,
      COALESCE(wr.pos, 0) AS rank_pos,
      COALESCE(wr.score, 0) AS score
    FROM bairristas b
    LEFT JOIN weekly_deliveries wd ON wd.member_id = b.id
    LEFT JOIN weekly_sales ws ON ws.member_id = b.id
    LEFT JOIN total_deliveries td ON td.member_id = b.id
    LEFT JOIN last_delivery ld ON ld.member_id = b.id
    LEFT JOIN last_saida ls ON ls.member_id = b.id
    LEFT JOIN weekly_rank wr ON wr.member_id = b.id
    ORDER BY wr.pos ASC NULLS LAST, b.display_name ASC
    `,
    [DELIVERY_TYPES, weekStart, weekEnd, SALE_TYPES, weekStart]
  );

  const rows = res.rows;
  if (!rows.length) {
    return safeReply(interaction, { content: 'Sem bairristas registados.' }, { messageClass: 'BANAL' });
  }

  // ── Constrói embeds com fields inline (cada bairrista = um field) ──
  const weekLabel = `*Semana: ${formatPtDateOnly(start)} a ${formatPtDateOnly(end)}*`;
  const statsLine = `**${rows.length}** bairrista(s) ativo(s) · **${rows.filter(r => r.rank_pos > 0).length}** no ranking`;

  // Separa activos (têm entregas na semana) vs inactivos (zero na semana)
  const ativosSemana = rows.filter(r => r.deliveries_week > 0 || r.sales_week > 0);
  const inativosSemana = rows.filter(r => r.deliveries_week === 0 && r.sales_week === 0);

  const MAX_FIELDS_PER_EMBED = 25; // limite do Discord

  function buildBairristaField(r) {
    const tier = TIER_ABBR[r.tier] || '—';
    const emoji = TIER_EMOJI[r.tier] || '👤';
    const rank = r.rank_pos > 0 ? `#${r.rank_pos}` : '—';
    const entTotal = fmtNum(r.deliveries_total);
    const entSem = r.deliveries_week > 0 ? r.deliveries_week : 0;
    const vndSem = r.sales_week > 0 ? r.sales_week : 0;
    const lastEnt = daysAgo(r.last_delivery);
    const lastSaida = daysAgo(r.last_saida);

    const name = `${emoji} ${truncateName(r.display_name, 18)} (${tier})`;
    const value = [
      `🏆 Rank: ${rank} · Score: ${fmtNum(r.score)}`,
      `📦 Total: ${entTotal} · Sem: ${entSem}`,
      `💰 Vnd sem: ${vndSem}`,
      `📅 Últ. entrega: ${lastEnt}`,
      `🎯 Últ. saída: ${lastSaida}`,
    ].join('\n');

    return { name, value, inline: true };
  }

  function chunkFields(fields, size) {
    const chunks = [];
    for (let i = 0; i < fields.length; i += size) {
      chunks.push(fields.slice(i, i + size));
    }
    return chunks;
  }

  const embeds = [];

  // Embed principal com descrição
  const mainEmbed = brandEmbed()
    .setColor(COLOR.INFO)
    .setTitle('📋 Bairristas Ativos')
    .setDescription([weekLabel, '', statsLine].join('\n'));
  embeds.push(mainEmbed);

  // Seção: Activo esta semana
  if (ativosSemana.length > 0) {
    const fields = ativosSemana.map(buildBairristaField);
    const chunks = chunkFields(fields, MAX_FIELDS_PER_EMBED);
    chunks.forEach((chunk, idx) => {
      const title = idx === 0 ? `🟢 Com movimento esta semana (${ativosSemana.length})` : `🟢 Com movimento (cont.)`;
      embeds.push(brandEmbed().setColor(COLOR.SUCCESS).setTitle(title).addFields(chunk));
    });
  }

  // Seção: Inactivo esta semana
  if (inativosSemana.length > 0) {
    const fields = inativosSemana.map(buildBairristaField);
    const chunks = chunkFields(fields, MAX_FIELDS_PER_EMBED);
    chunks.forEach((chunk, idx) => {
      const title = idx === 0 ? `🔴 Sem movimento esta semana (${inativosSemana.length})` : `🔴 Sem movimento (cont.)`;
      embeds.push(brandEmbed().setColor(COLOR.WARNING_SOFT).setTitle(title).addFields(chunk));
    });
  }

  // Limite do Discord: máximo 10 embeds por mensagem
  const MAX_EMBEDS = 10;
  const finalEmbeds = embeds.slice(0, MAX_EMBEDS);
  if (embeds.length > MAX_EMBEDS) {
    finalEmbeds[MAX_EMBEDS - 1].setFooter({
      text: `… e mais ${embeds.length - MAX_EMBEDS} secção(ões) omitidas. Usa filtros para ver todos.`,
    });
  }

  return safeReply(interaction, { embeds: finalEmbeds }, { messageClass: 'BANAL' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Ver Entregas / Vendas
// ══════════════════════════════════════════════════════════════════════════════

async function verEntregasOuVendas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('ver dados'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = interaction.customId;
  const types = id.includes('entregas') ? DELIVERY_TYPES : SALE_TYPES;
  const label = id.includes('entregas') ? 'Entregas' : 'Vendas';
  const res = await query(
    `
    SELECT m.display_name, m.discord_id, SUM(im.quantity) as total
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    WHERE im.movement_type = ANY($1)
    GROUP BY m.display_name, m.discord_id
    ORDER BY total DESC LIMIT 20
  `,
    [types]
  );
  if (!res.rows.length) {
    return safeReply(
      interaction,
      {
        content: `Sem ${label.toLowerCase()} registadas.`,
      },
      { messageClass: 'BANAL' }
    );
  }
  const lines = res.rows.map((r, i) => `**${i + 1}.** <@${r.discord_id}> — ${r.total} unidades`);
  const embed = brandEmbed().setTitle(`${label} por Bairrista`).setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Ver Tops
// ══════════════════════════════════════════════════════════════════════════════

async function verTopsBairristas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('ver tops'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { rankingRepo } = require('../repositories');
  const { start, end } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  const rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'bairrista', 10);
  const weekLabel = `${formatPtDateOnly(start)} a ${formatPtDateOnly(end)}`;
  const embed = rankingEmbed('Top Bairristas', rankings, weekLabel);
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = {
  listarBairristas,
  verEntregasOuVendas,
  verTopsBairristas,
};
