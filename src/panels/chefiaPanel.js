'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel da Chefia — Comando (RENOVADO v11)
// ══════════════════════════════════════════════════════════════════════════════
// Secções: 🟢 Abrir/Criar | 🔵 Ver/Consultar | 🟠 Gerir/Dados

async function buildChefiaPanel() {
  const [openOps, stockAgg, topWeek, openIncidents, activeMembers] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
    query(
      'SELECT COUNT(DISTINCT item_id)::int AS items, COALESCE(SUM(balance),0)::int AS units FROM inventory_stock_snapshot'
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
    query("SELECT COUNT(*)::int AS c FROM incidents WHERE estado = 'open'"),
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
  ]);

  const ops = openOps.rows[0]?.c ?? 0;
  const items = stockAgg.rows[0]?.items ?? 0;
  const units = stockAgg.rows[0]?.units ?? 0;
  const topName = topWeek.rows[0]?.display_name ?? '—';
  const topQty = topWeek.rows[0]?.total_qty ?? 0;
  const inc = openIncidents.rows[0]?.c ?? 0;
  const members = activeMembers.rows[0]?.c ?? 0;

  const embed = applyLogo(
    brandEmbed('MOVEMENT')
      .setColor(COLOR.DANGER)
      .setTitle(`${EMOJI.LIDER} Painel da Chefia | Firma RedWood`)
      .setDescription('**Aqui não se pergunta — decide-se.**')
      .addFields(
        { name: `${EMOJI.SAIDA} Saídas`, value: `**${ops}** activas`, inline: true },
        {
          name: `${EMOJI.STOCK} Stock`,
          value: `**${items}** itens · **${units.toLocaleString('pt-PT')}** un`,
          inline: true,
        },
        { name: `${EMOJI.PARTICIPANTE} Bairristas`, value: `**${members}** activos`, inline: true },
        {
          name: `${EMOJI.MEDAL_1} Top Entregador`,
          value: `**${topName}** — ${Number(topQty).toLocaleString('pt-PT')} qty`,
          inline: true,
        },
        {
          name: `${EMOJI.ERRO} Incidentes`,
          value: inc > 0 ? `**${inc}** abertos ⚠️` : '**0** abertos ✅',
          inline: true,
        },
        { name: `${EMOJI.INFO} Cores dos botões`, value: '🟢 Criar · 🔵 Ver · 🟠 Gerir', inline: true }
      )
  );

  // Row 1 — 🟢 CRIAR / ABRIR / REGISTAR
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Abrir Saída', style: 'Success', emoji: EMOJI.NOVO }),
    button({
      customId: 'bairrista::registar_material',
      label: 'Registar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    }),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA })
  );

  // Row 2 — 🔵 VER / CONSULTAR
  const row2 = buttonRow(
    button({ customId: 'chefia::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 3 — 🟠 GERIR / DADOS
  const row3 = buttonRow(
    button({
      customId: 'patrao::listar_bairristas',
      label: 'Listar Bairristas',
      style: 'Secondary',
      emoji: EMOJI.PARTICIPANTE,
    }),
    button({ customId: 'chefia::ajustar_stock', label: 'Ajustar Stock', style: 'Secondary', emoji: EMOJI.AJUSTAR }),
    button({ customId: 'chefia::gerir_materiais', label: 'Gerir Materiais', style: 'Secondary', emoji: EMOJI.EDITAR }),
    button({ customId: 'chefia::listar_stickys', label: 'Stickys', style: 'Secondary', emoji: EMOJI.STICKY })
  );

  // Row 4 — 🟠 DADOS / RELATÓRIOS
  const row4 = buttonRow(
    button({ customId: 'chefia::ver_tops', label: 'Topo', style: 'Secondary', emoji: EMOJI.TOPO }),
    button({ customId: 'chefia::ver_logs', label: 'Logs', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::movimento', label: 'Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildChefiaPanel };
