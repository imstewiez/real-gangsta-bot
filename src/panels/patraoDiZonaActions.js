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

  // Query otimizada: subqueries correlacionadas só calculam para os bairristas
  // activos (evita full table scans em tabelas grandes).
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

  function fmtBairrista(r, idx) {
    const tier = TIER_ABBR[r.tier] || '—';
    const emoji = TIER_EMOJI[r.tier] || '👤';
    const rank = r.rank_pos > 0 ? `#${r.rank_pos}` : '—';
    const entTotal = fmtNum(r.deliveries_total);
    const entSem = r.deliveries_week || 0;
    const vndSem = r.sales_week || 0;
    const lastEnt = daysAgo(r.last_delivery);
    const lastSaida = daysAgo(r.last_saida);

    const line1 = `${emoji} **${truncateName(r.display_name, 18)}**  \`${tier}\`  ·  Rank ${rank}  ·  Score ${fmtNum(r.score)}`;
    const line2 = `⠀⠀📦 Entregas: **${entTotal}** total  |  **${entSem}** esta semana  |  💰 Vendas: **${vndSem}**`;
    const line3 = `⠀⠀📅 Última entrega: **${lastEnt}**  |  🎯 Última saída: **${lastSaida}**`;

    return [line1, line2, line3].join('\n');
  }

  const ativos = rows.filter(r => r.deliveries_week > 0 || r.sales_week > 0);
  const inativos = rows.filter(r => r.deliveries_week === 0 && r.sales_week === 0);

  // ── Legenda + Ativos (Embed 1) ──
  const lines1 = [];
  lines1.push('**📖 Legenda**');
  lines1.push('🩸 YB = Young Blood  |  🔫 OG = O Gunão  |  👑 GF = Gangster Fodido');
  lines1.push('📦 = Entregas (total | semana)  |  💰 = Vendas (semana)');
  lines1.push('📅 = Última entrega  |  🎯 = Última saída');
  lines1.push('');
  lines1.push(weekLabel);
  lines1.push('');

  if (ativos.length > 0) {
    lines1.push(`**🟢 Com movimento esta semana — ${ativos.length}**`);
    lines1.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    ativos.forEach((r, i) => lines1.push(fmtBairrista(r, i)));
    lines1.push('');
  }

  // Adiciona os primeiros inativos que couberem
  let inativosRestantes = [];
  if (inativos.length > 0) {
    lines1.push(`**🔴 Sem movimento esta semana — ${inativos.length}**`);
    lines1.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (let i = 0; i < inativos.length; i++) {
      const candidate = fmtBairrista(inativos[i], i);
      const testLines = [...lines1, candidate];
      if (testLines.join('\n').length > 3900) {
        inativosRestantes = inativos.slice(i);
        break;
      }
      lines1.push(candidate);
    }
  }

  lines1.push('');
  lines1.push(
    `📊 **${rows.length}** bairrista(s) ativo(s)  ·  **${rows.filter(r => r.rank_pos > 0).length}** no ranking`
  );

  const embed1 = brandEmbed().setColor(COLOR.INFO).setTitle('📋 Bairristas Ativos').setDescription(lines1.join('\n'));

  const embeds = [embed1];

  // ── Inativos restantes (Embed 2, se necessário) ──
  if (inativosRestantes.length > 0) {
    const lines2 = [];
    lines2.push(`**🔴 Sem movimento esta semana (cont.) — ${inativosRestantes.length}**`);
    lines2.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let omitted = 0;
    for (let i = 0; i < inativosRestantes.length; i++) {
      const candidate = fmtBairrista(inativosRestantes[i], i);
      const testLines = [...lines2, candidate];
      if (testLines.join('\n').length > 3900) {
        omitted = inativosRestantes.length - i;
        break;
      }
      lines2.push(candidate);
    }

    const embed2 = brandEmbed()
      .setColor(COLOR.WARNING_SOFT)
      .setTitle('🔴 Bairristas Inativos (cont.)')
      .setDescription(lines2.join('\n'));

    if (omitted > 0) {
      embed2.setFooter({ text: `… e mais ${omitted} bairrista(s) não mostrados.` });
    }

    embeds.push(embed2);
  }

  return safeReply(interaction, { embeds }, { messageClass: 'BANAL' });
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
