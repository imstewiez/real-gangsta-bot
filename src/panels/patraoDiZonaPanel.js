'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Patrão di Zona (RENOVADO v12)
// ══════════════════════════════════════════════════════════════════════════════
// Herança: TUDO da Chefia + funções de Patrão
// Cores globais: 🟢 Criar/Registar | 🔵 Ver/Consultar | 🟠 Pessoal/Gerir

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
        { name: `${EMOJI.INFO} Cores`, value: '🟢 Registar · 🔵 Ver · 🟠 Gerir', inline: true }
      )
  );

  // Row 1 — 🟢 REGISTAR (base, herdado do bairrista)
  const row1 = buttonRow(
    button({
      customId: 'bairrista::entregar_material',
      label: 'Entregar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    }),
    button({ customId: 'bairrista::vender', label: 'Vender', style: 'Success', emoji: EMOJI.VENDA }),
    button({ customId: 'bairrista::registar_kill', label: 'Registar Kill', style: 'Success', emoji: EMOJI.KILL }),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA })
  );

  // Row 2 — 🟢 OFICIAL (operações de saída)
  const row2 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Abrir Saída', style: 'Success', emoji: EMOJI.NOVO }),
    button({ customId: 'chefia::fechar_saida', label: 'Fechar Saída', style: 'Success', emoji: EMOJI.FECHAR }),
    button({ customId: 'oficial::emitir_material', label: 'Emitir Material', style: 'Success', emoji: EMOJI.FORNECER }),
    button({
      customId: 'oficial::add_participante',
      label: 'Add Participante',
      style: 'Success',
      emoji: EMOJI.PARTICIPANTE,
    })
  );

  // Row 3 — 🟢 CHEFIA (gestão)
  const row3 = buttonRow(
    button({ customId: 'chefia::criar_meta', label: 'Criar Meta', style: 'Success', emoji: EMOJI.OK }),
    button({ customId: 'chefia::criar_incidente', label: 'Criar Incidente', style: 'Success', emoji: EMOJI.ERRO }),
    button({
      customId: 'chefia::transferir_stock',
      label: 'Transferir Stock',
      style: 'Success',
      emoji: EMOJI.MOVIMENTO,
    }),
    button({ customId: 'chefia::ausencias', label: 'Ausências', style: 'Success', emoji: EMOJI.PENDENTE })
  );

  // Row 4 — 🔵 VER (consultas base)
  const row4 = buttonRow(
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'chefia::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::ranking', label: 'Ver Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 5 — 🔵 PATRÃO (visão zona)
  const row5 = buttonRow(
    button({
      customId: 'patrao::listar_bairristas',
      label: 'Listar Bairristas',
      style: 'Primary',
      emoji: EMOJI.PARTICIPANTE,
    }),
    button({ customId: 'patrao::ver_entregas', label: 'Ver Entregas', style: 'Primary', emoji: EMOJI.ENTREGA }),
    button({ customId: 'patrao::ver_vendas', label: 'Ver Vendas', style: 'Primary', emoji: EMOJI.VENDA }),
    button({ customId: 'patrao::ver_tops', label: 'Topo da Zona', style: 'Primary', emoji: EMOJI.TOPO }),
    button({ customId: 'patrao::reputacao', label: 'Reputação', style: 'Primary', emoji: EMOJI.LIDER })
  );

  // Row 6 — 🔵 CHEFIA (dashboards)
  const row6 = buttonRow(
    button({
      customId: 'chefia::painel_pendencias',
      label: 'Painel Pendências',
      style: 'Primary',
      emoji: EMOJI.PENDENTE,
    }),
    button({ customId: 'chefia::relatorio', label: 'Relatório', style: 'Primary', emoji: EMOJI.AUDIT }),
    button({ customId: 'chefia::dashboard', label: 'Dashboard', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'chefia::inactivos', label: 'Inactivos', style: 'Primary', emoji: EMOJI.WARN })
  );

  // Row 7 — 🔵 VER + LOGS
  const row7 = buttonRow(
    button({ customId: 'bairrista::catalogo', label: 'Ver Catálogo', style: 'Primary', emoji: EMOJI.MATERIAL }),
    button({ customId: 'bairrista::metas', label: 'Ver Metas', style: 'Primary', emoji: EMOJI.OK }),
    button({ customId: 'chefia::ver_logs', label: 'Logs', style: 'Primary', emoji: EMOJI.AUDIT }),
    button({ customId: 'chefia::listar_stickys', label: 'Stickys', style: 'Primary', emoji: EMOJI.STICKY })
  );

  // Row 8 — 🟠 GERIR (chefia)
  const row8 = buttonRow(
    button({ customId: 'chefia::ajustar_stock', label: 'Ajustar Stock', style: 'Secondary', emoji: EMOJI.AJUSTAR }),
    button({ customId: 'chefia::gerir_materiais', label: 'Gerir Materiais', style: 'Secondary', emoji: EMOJI.EDITAR }),
    button({ customId: 'chefia::promover', label: 'Promover', style: 'Secondary', emoji: EMOJI.PROGRESSO }),
    button({ customId: 'chefia::lifecycle', label: 'Lifecycle', style: 'Secondary', emoji: EMOJI.PARTICIPANTE })
  );

  // Row 9 — 🟠 PATRÃO (admin zona)
  const row9 = buttonRow(
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

  // Row 10 — 🟠 GERIR (mais admin)
  const row10 = buttonRow(
    button({ customId: 'chefia::exportar', label: 'Exportar', style: 'Secondary', emoji: EMOJI.DINHEIRO }),
    button({ customId: 'chefia::sync_sheets', label: 'Sync Sheets', style: 'Secondary', emoji: EMOJI.REFRESH }),
    button({ customId: 'chefia::qualidade_dados', label: 'Qualidade Dados', style: 'Secondary', emoji: EMOJI.INFO }),
    button({
      customId: 'chefia::republicar_disponibilidade',
      label: 'Republicar Disp.',
      style: 'Secondary',
      emoji: EMOJI.PRESENCA,
    })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5, row6, row7, row8, row9, row10] };
}

module.exports = { buildPatraoDiZonaPanel };
