'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Patrão di Zona — Visão da Zona (SIMPLIFICADO)
// ══════════════════════════════════════════════════════════════════════════════

async function buildPatraoDiZonaPanel() {
  const [activeMembers, weekDeliveries, weekSales, topZone] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'ativo'"),
    query(
      "SELECT COALESCE(SUM(quantity),0)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_bairrista','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
    ),
    query(
      "SELECT COALESCE(SUM(quantity),0)::int AS c FROM inventory_movements WHERE movement_type = 'venda_bairrista' AND created_at >= date_trunc('week', NOW())"
    ),
    query(`
      SELECT m.display_name, SUM(im.quantity) AS total_qty
      FROM inventory_movements im
      JOIN members m ON m.id = im.member_id
      WHERE im.movement_type IN ('entrega_bairrista','entrega_oficial')
        AND im.created_at >= date_trunc('week', NOW())
      GROUP BY m.display_name
      ORDER BY total_qty DESC
      LIMIT 1
    `),
  ]);

  const members = activeMembers.rows[0]?.c ?? 0;
  const deliv = weekDeliveries.rows[0]?.c ?? 0;
  const sales = weekSales.rows[0]?.c ?? 0;
  const topName = topZone.rows[0]?.display_name ?? '—';
  const topQty = topZone.rows[0]?.total_qty ?? 0;

  const embed = applyLogo(
    brandEmbed('HOUSE')
      .setColor(COLOR.PURPLE)
      .setTitle(`${EMOJI.LIDER} Painel do Patrão di Zona | Firma RedWood`)
      .setDescription('**A zona é tua.**')
      .addFields(
        { name: `${EMOJI.PARTICIPANTE} Bairristas`, value: `**${members}** activos`, inline: true },
        { name: `${EMOJI.ENTREGA} Entregas (Semana)`, value: `**${deliv.toLocaleString('pt-PT')}** qty`, inline: true },
        { name: `${EMOJI.VENDA} Vendas (Semana)`, value: `**${sales.toLocaleString('pt-PT')}** qty`, inline: true },
        {
          name: `${EMOJI.MEDAL_1} Top da Zona`,
          value: `**${topName}** — ${Number(topQty).toLocaleString('pt-PT')} qty`,
          inline: false,
        }
      )
  );

  // Row 1 — Zona
  const row1 = buttonRow(
    button({
      customId: 'patrao::listar_bairristas',
      label: 'Listar Bairristas',
      style: 'Success',
      emoji: EMOJI.PARTICIPANTE,
    }),
    button({ customId: 'patrao::ver_entregas', label: 'Ver Entregas', style: 'Success', emoji: EMOJI.ENTREGA }),
    button({ customId: 'patrao::ver_vendas', label: 'Ver Vendas', style: 'Success', emoji: EMOJI.VENDA }),
    button({ customId: 'patrao::ver_tops', label: 'Top da Zona', style: 'Success', emoji: EMOJI.TOPO })
  );

  return { embeds: [embed], components: [row1] };
}

module.exports = { buildPatraoDiZonaPanel };
