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

const TIER_EMOJI = {
  young_blood: '🔰',
  o_gunao: '⭐',
  gangster_fodido: '🔥',
};

const TIER_ABBR = {
  young_blood: 'YB',
  o_gunao: 'OG',
  gangster_fodido: 'GF',
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

  // Query agregada: membros + entregas semana + vendas semana + ranking
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
    )
    SELECT
      b.id,
      b.discord_id,
      b.display_name,
      b.tier,
      b.joined_at,
      COALESCE(wd.total, 0) AS deliveries,
      COALESCE(ws.total, 0) AS sales,
      COALESCE(wr.pos, 0) AS rank_pos,
      COALESCE(wr.score, 0) AS score
    FROM bairristas b
    LEFT JOIN weekly_deliveries wd ON wd.member_id = b.id
    LEFT JOIN weekly_sales ws ON ws.member_id = b.id
    LEFT JOIN weekly_rank wr ON wr.member_id = b.id
    ORDER BY wr.pos ASC NULLS LAST, b.display_name ASC
    `,
    [DELIVERY_TYPES, weekStart, weekEnd, SALE_TYPES, weekStart]
  );

  const rows = res.rows;
  if (!rows.length) {
    return safeReply(interaction, { content: 'Sem bairristas registados.' }, { messageClass: 'BANAL' });
  }

  // Cabeçalho da tabela
  const header = '```\nNome           Tier  Ent  Vnd  Rank  Score';
  const sep = '────────────────────────────────────────';
  const tableLines = rows.map(r => {
    const name = truncateName(r.display_name, 13).padEnd(13);
    const tier = (TIER_ABBR[r.tier] || '—').padEnd(4);
    const ent = String(r.deliveries || 0).padStart(3);
    const vnd = String(r.sales || 0).padStart(3);
    const rank = r.rank_pos ? `#${String(r.rank_pos).padStart(2)}` : '—  ';
    const score = fmtNum(r.score).padStart(5);
    return `${name}  ${tier} ${ent}  ${vnd}  ${rank}  ${score}`;
  });
  const footer = '```';

  const description = [
    `*Semana: ${formatPtDateOnly(start)} a ${formatPtDateOnly(end)}*`,
    '',
    header,
    sep,
    ...tableLines,
    footer,
    '',
    `**${rows.length}** bairrista(s) ativo(s) · ${rows.filter(r => r.rank_pos > 0).length} no ranking`,
  ].join('\n');

  const embed = brandEmbed().setColor(COLOR.INFO).setTitle('📋 Bairristas Ativos').setDescription(description);

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
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
