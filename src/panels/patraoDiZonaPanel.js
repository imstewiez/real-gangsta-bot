'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Patrão di Zona — Visão da Zona (REORGANIZADO)
// ══════════════════════════════════════════════════════════════════════════════
// Aqui vive TUDO o que é visão e gestão da zona: listar bairristas, ver
// entregas/vendas, topo da zona, reputação, tarefas, etc.
// Sem cenas de bairrista, saídas, ou chefia — isso está nos painéis
// respectivos. Cores: 🟢 Zona · 🔵 Ver

async function buildPatraoDiZonaPanel() {
  const [activeMembers, weekDeliveries, weekSales, weekKills, topZone, openOps, openIncidents, activeGoals] =
    await Promise.all([
      query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
      query(
        "SELECT COALESCE(SUM(qty),0)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_morador','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
      ),
      query(
        "SELECT COALESCE(SUM(qty),0)::int AS c FROM inventory_movements WHERE movement_type = 'venda_morador' AND created_at >= date_trunc('week', NOW())"
      ),
      query("SELECT COUNT(*)::int AS c FROM kill_logs WHERE created_at >= date_trunc('week', NOW())"),
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
      query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
      query("SELECT COUNT(*)::int AS c FROM incidents WHERE estado = 'open'"),
      query("SELECT COUNT(*)::int AS c FROM weekly_goals WHERE status = 'active'"),
    ]);

  const members = activeMembers.rows[0]?.c ?? 0;
  const deliv = weekDeliveries.rows[0]?.c ?? 0;
  const sales = weekSales.rows[0]?.c ?? 0;
  const kills = weekKills.rows[0]?.c ?? 0;
  const topName = topZone.rows[0]?.display_name ?? '—';
  const topQty = topZone.rows[0]?.total_qty ?? 0;
  const ops = openOps.rows[0]?.c ?? 0;
  const inc = openIncidents.rows[0]?.c ?? 0;
  const goals = activeGoals.rows[0]?.c ?? 0;

  const embed = applyLogo(
    brandEmbed('HOUSE')
      .setColor(COLOR.PURPLE)
      .setTitle(`${EMOJI.LIDER} Painel do Patrão di Zona | Firma RedWood`)
      .setDescription('**A zona é tua.**')
      .addFields(
        { name: `${EMOJI.PARTICIPANTE} Bairristas`, value: `**${members}** activos`, inline: true },
        { name: `${EMOJI.ENTREGA} Entregas (Semana)`, value: `**${deliv.toLocaleString('pt-PT')}** qty`, inline: true },
        { name: `${EMOJI.VENDA} Vendas (Semana)`, value: `**${sales.toLocaleString('pt-PT')}** qty`, inline: true },
        { name: `${EMOJI.KILL} Kills (Semana)`, value: `**${kills}** registadas`, inline: true },
        { name: `${EMOJI.SAIDA} Saídas`, value: `**${ops}** activas`, inline: true },
        { name: `${EMOJI.OK} Metas`, value: `**${goals}** activas`, inline: true },
        {
          name: `${EMOJI.MEDAL_1} Top da Zona`,
          value: `**${topName}** — ${Number(topQty).toLocaleString('pt-PT')} qty`,
          inline: false,
        },
        {
          name: `${EMOJI.ERRO} Incidentes`,
          value: inc > 0 ? `**${inc}** abertos ${EMOJI.WARN}` : `**0** abertos ${EMOJI.OK}`,
          inline: true,
        },
        { name: `${EMOJI.INFO} Cores`, value: '🟢 Zona · 🔵 Ver · 🟠 Gerir', inline: true }
      )
  );

  // Row 1 — 🟢 ZONA (visão e acções do patrão)
  const row1 = buttonRow(
    button({
      customId: 'patrao::listar_bairristas',
      label: 'Listar Bairristas',
      style: 'Success',
      emoji: EMOJI.PARTICIPANTE,
    }),
    button({ customId: 'patrao::ver_entregas', label: 'Ver Entregas', style: 'Success', emoji: EMOJI.ENTREGA }),
    button({ customId: 'patrao::ver_vendas', label: 'Ver Vendas', style: 'Success', emoji: EMOJI.VENDA }),
    button({ customId: 'patrao::ver_tops', label: 'Topo da Zona', style: 'Success', emoji: EMOJI.TOPO }),
    button({ customId: 'patrao::reputacao', label: 'Reputação', style: 'Success', emoji: EMOJI.LIDER })
  );

  // Row 2 — 🔵 VER (consultas de zona)
  const row2 = buttonRow(
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'chefia::dashboard', label: 'Dashboard', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'chefia::relatorio', label: 'Relatório', style: 'Primary', emoji: EMOJI.AUDIT })
  );

  // Row 3 — 🟠 GERIR (administração da zona)
  const row3 = buttonRow(
    button({ customId: 'patrao::tarefas', label: 'Tarefas', style: 'Secondary', emoji: EMOJI.ENCOMENDA }),
    button({ customId: 'patrao::manutencao', label: 'Manutenção', style: 'Secondary', emoji: EMOJI.AJUSTAR }),
    button({
      customId: 'patrao::simular_permissoes',
      label: 'Simular Permissões',
      style: 'Secondary',
      emoji: EMOJI.VER,
    }),
    button({ customId: 'patrao::audit_trail', label: 'Audit Trail', style: 'Secondary', emoji: EMOJI.AUDIT })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildPatraoDiZonaPanel };
