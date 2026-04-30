'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Patrão di Zona (RENOVADO v10)
// ══════════════════════════════════════════════════════════════════════════════
// Embed dinâmico com dados reais da zona + botões com cores funcionais.

async function buildPatraoDiZonaPanel() {
  const [activeMembers, weeklyDeliveries, weeklySales, topZone] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
    query(
      "SELECT COALESCE(SUM(qty),0)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_morador','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
    ),
    query(
      "SELECT COALESCE(SUM(qty),0)::int AS c FROM inventory_movements WHERE movement_type = 'venda_morador' AND created_at >= date_trunc('week', NOW())"
    ),
    query(`
      SELECT m.display_name, SUM(im.qty) AS total_qty
      FROM inventory_movements im
      JOIN members m ON m.id = im.member_id
      WHERE im.movement_type IN ('entrega_morador','entrega_oficial')
        AND im.created_at >= date_trunc('week', NOW())
      GROUP BY m.display_name
      ORDER BY total_qty DESC
      LIMIT 1
    `),
  ]);

  const membersCount = activeMembers.rows[0]?.c ?? 0;
  const delivQty = weeklyDeliveries.rows[0]?.c ?? 0;
  const salesQty = weeklySales.rows[0]?.c ?? 0;
  const topName = topZone.rows[0]?.display_name ?? '—';
  const topQty = topZone.rows[0]?.total_qty ?? 0;

  const embed = applyLogo(
    brandEmbed('HOUSE')
      .setColor(COLOR.PURPLE)
      .setTitle(`${EMOJI.LIDER} Painel do Patrão di Zona | Firma RedWood`)
      .setDescription('**A zona é tua.**')
      .addFields(
        { name: `${EMOJI.PARTICIPANTE} Bairristas Activos`, value: `**${membersCount}** na firma`, inline: true },
        {
          name: `${EMOJI.ENTREGA} Entregas (Semana)`,
          value: `**${delivQty.toLocaleString('pt-PT')}** qty`,
          inline: true,
        },
        { name: `${EMOJI.VENDA} Vendas (Semana)`, value: `**${salesQty.toLocaleString('pt-PT')}** qty`, inline: true },
        {
          name: `${EMOJI.MEDAL_1} Top da Zona`,
          value: `**${topName}** — ${Number(topQty).toLocaleString('pt-PT')} qty`,
          inline: false,
        },
        { name: `${EMOJI.INFO} Dica`, value: '🟢 = acção · 🔵 = ver dados · 🟠 = consultar', inline: false }
      )
  );

  const B = BUTTONS.PATRAO;

  // Row 1 — Ações 🟢
  const row1 = buttonRow(
    button({
      customId: 'bairrista::registar_material',
      label: 'Registar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    }),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA })
  );

  // Row 2 — Ver 🔵
  const row2 = buttonRow(
    buttonFromDef('patrao::listar_bairristas', B.LISTAR),
    buttonFromDef('patrao::ver_entregas', B.ENTREGAS),
    buttonFromDef('patrao::ver_vendas', B.VENDAS),
    buttonFromDef('patrao::ver_tops', B.TOPOS)
  );

  // Row 3 — Consultar 🟠
  const row3 = buttonRow(
    button({ customId: 'bairrista::movimento', label: 'Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Secondary', emoji: EMOJI.MEDAL_1 }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildPatraoDiZonaPanel };
