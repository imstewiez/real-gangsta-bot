'use strict';
/**
 * Patrão di Zona panel — acções de botão do painel `patrao::*`.
 *
 *   - listar_bairristas — lista bairristas activos c/ stats semanais
 *   - ver_entregas      — top de entregas por bairrista
 *   - ver_vendas        — top de vendas por bairrista
 *   - ver_tops          — top semanal dos bairristas
 */

const { MessageFlags, EmbedBuilder } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { rankingEmbed, COLOR } = require('../shared/embedBuilders');
const { ERRORS } = require('../content');
const { isPatraoDiZona } = require('../permissions/permissionEngine');
const { DELIVERY_TYPES, SALE_TYPES } = require('../shared/movementTypes');
const { query } = require('../db');
const { weekBounds } = require('../util');
const { formatPtDateOnly } = require('../shared/formatPtDate');
const { log, warn } = require('../logger');

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

function truncateName(name = '', max = 16) {
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
  const t0 = Date.now();
  try {
    return await _listarBairristasInner(interaction, t0);
  } catch (e) {
    warn(`[listarBairristas] ERRO: ${e.message}\n${e.stack}`);
    return safeReply(
      interaction,
      {
        content: `${ERRORS.GENERIC || '❌ Erro ao carregar bairristas.'} (${e.message.slice(0, 100)})`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'ERROR' }
    );
  }
}

async function _listarBairristasInner(interaction, t0) {
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
      COALESCE(wd.total, 0) AS deliveries_week,
      COALESCE(ws.total, 0) AS sales_week,
      COALESCE(wr.pos, 0) AS rank_pos,
      COALESCE(wr.score, 0) AS score,
      COALESCE(
        (SELECT SUM(quantity)::int FROM inventory_movements im
         WHERE im.member_id = b.id AND im.movement_type = ANY($1)),
        0
      ) AS deliveries_total,
      (SELECT MAX(im.created_at)::date FROM inventory_movements im
       WHERE im.member_id = b.id AND im.movement_type = ANY($1)) AS last_delivery,
      (SELECT MAX(o.date) FROM operation_participants op
       JOIN operations o ON o.id = op.operation_id
       WHERE op.member_id = b.id) AS last_saida
    FROM bairristas b
    LEFT JOIN weekly_deliveries wd ON wd.member_id = b.id
    LEFT JOIN weekly_sales ws ON ws.member_id = b.id
    LEFT JOIN weekly_rank wr ON wr.member_id = b.id
    ORDER BY wr.pos ASC NULLS LAST, b.display_name ASC
    `,
    [DELIVERY_TYPES, weekStart, weekEnd, SALE_TYPES, weekStart]
  );

  const rows = res.rows;
  log(`[listarBairristas] Query devolveu ${rows.length} rows em ${Date.now() - t0}ms`);

  if (!rows.length) {
    return safeReply(interaction, { content: 'Sem bairristas registados.' }, { messageClass: 'BANAL' });
  }

  const weekLabel = `*Semana: ${formatPtDateOnly(start)} a ${formatPtDateOnly(end)}*`;

  function fmtBairrista(r) {
    const tier = TIER_ABBR[r.tier] || '-';
    const emoji = TIER_EMOJI[r.tier] || '👤';
    const rank = r.rank_pos > 0 ? `#${r.rank_pos}` : '-';
    const entTotal = fmtNum(r.deliveries_total);
    const entSem = r.deliveries_week || 0;
    const vndSem = r.sales_week || 0;
    const lastEnt = daysAgo(r.last_delivery);
    const lastSaida = daysAgo(r.last_saida);

    return (
      `${emoji} **${truncateName(r.display_name, 16)}** \`${tier}\`  Rank:${rank}  Score:${fmtNum(r.score)}\n` +
      `> 📦${entTotal} tot | ${entSem} sem  |  💰${vndSem}  |  📅${lastEnt}  |  🎯${lastSaida}`
    );
  }

  // ── Construir chunks de embeds (max ~5500 chars por embed para ter margem) ──
  const MAX_EMBED_TEXT = 5500;
  const HEADER_LEN = 300; // legenda aproximada

  const ativos = rows.filter(r => r.deliveries_week > 0 || r.sales_week > 0);
  const inativos = rows.filter(r => r.deliveries_week === 0 && r.sales_week === 0);

  const embeds = [];
  let currentLines = [];
  let currentLen = 0;
  let isFirstEmbed = true;
  let inativosIdx = 0;

  function flushEmbed(forceTitle = null) {
    if (!currentLines.length) return;
    const title = forceTitle || (isFirstEmbed ? '📋 Bairristas Ativos' : 'Bairristas (cont.)');
    const color = isFirstEmbed ? COLOR.INFO : COLOR.WARNING_SOFT;
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(currentLines.join('\n'));
    embeds.push(embed);
    currentLines = [];
    currentLen = 0;
    isFirstEmbed = false;
  }

  function pushLine(line, extra = 0) {
    const lineLen = line.length + 1; // +1 for newline
    if (currentLen + lineLen > MAX_EMBED_TEXT) {
      flushEmbed();
    }
    currentLines.push(line);
    currentLen += lineLen;
  }

  // Legenda (só no primeiro embed)
  pushLine('**📖 Legenda**');
  pushLine('> 🩸YB Young Blood  |  🔫OG O Gunao  |  👑GF Gangster Fodido');
  pushLine('> 📦Entregas(tot|sem)  |  💰Vendas(sem)  |  📅Ult.entrega  |  🎯Ult.saida');
  pushLine('');
  pushLine(weekLabel);
  pushLine('');

  // Ativos
  if (ativos.length > 0) {
    pushLine(`**-- Com movimento -- ${ativos.length}**`);
    pushLine('');
    for (const r of ativos) {
      pushLine(fmtBairrista(r));
      pushLine('');
    }
  }

  // Inativos
  if (inativos.length > 0) {
    pushLine(`**-- Sem movimento -- ${inativos.length}**`);
    pushLine('');
    for (const r of inativos) {
      pushLine(fmtBairrista(r));
      pushLine('');
    }
  }

  flushEmbed();

  // Adiciona footer com stats ao ultimo embed
  if (embeds.length > 0) {
    const last = embeds[embeds.length - 1];
    last.setFooter({
      text: `${rows.length} ativos | ${rows.filter(r => r.rank_pos > 0).length} no ranking`,
    });
  }

  // DEBUG: loga tamanhos antes de enviar
  embeds.forEach((e, i) => {
    log(`[listarBairristas] embed[${i}] title=${e.data.title?.length || 0} desc=${e.data.description?.length || 0}`);
  });

  try {
    return await interaction.editReply({ embeds });
  } catch (discordErr) {
    warn(`[listarBairristas] Discord REJECT: code=${discordErr.code} msg=${discordErr.message}`);
    embeds.forEach((e, i) => {
      warn(`[listarBairristas] embed[${i}] desc_len=${e.data.description?.length || 0}`);
    });
    return interaction.editReply({
      content: `❌ Erro ao mostrar embeds (${discordErr.message}). Tenta de novo.`,
    });
  }
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
  const embed = new EmbedBuilder().setTitle(`${label} por Bairrista`).setDescription(lines.join('\n'));
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
