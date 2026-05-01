'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { selectMenu, selectRow } = require('../shared/ui/selects');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel da Chefia — Comando e Gestão (REORGANIZADO)
// ══════════════════════════════════════════════════════════════════════════════
// Aqui vive TUDO o que é gestão da firma: metas, incidentes, stock, membros,
// relatórios, etc. Sem cenas de bairrista ou saídas — isso está nos painéis
// do bairro e dos oficiais. Cores: 🟢 Criar · 🔵 Ver · 🟠 Gerir

async function buildChefiaPanel() {
  const [openOps, stockAgg, topWeek, openIncidents, activeMembers, weekKills, weekDeliveries, activeGoals] =
    await Promise.all([
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
      query("SELECT COUNT(*)::int AS c FROM kill_logs WHERE created_at >= date_trunc('week', NOW())"),
      query(
        "SELECT COUNT(*)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_morador','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
      ),
      query("SELECT COUNT(*)::int AS c FROM weekly_goals WHERE status = 'active'"),
    ]);

  const ops = openOps.rows[0]?.c ?? 0;
  const items = stockAgg.rows[0]?.items ?? 0;
  const units = stockAgg.rows[0]?.units ?? 0;
  const topName = topWeek.rows[0]?.display_name ?? '—';
  const topQty = topWeek.rows[0]?.total_qty ?? 0;
  const inc = openIncidents.rows[0]?.c ?? 0;
  const members = activeMembers.rows[0]?.c ?? 0;
  const kills = weekKills.rows[0]?.c ?? 0;
  const deliv = weekDeliveries.rows[0]?.c ?? 0;
  const goals = activeGoals.rows[0]?.c ?? 0;

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
        { name: `${EMOJI.KILL} Kills (Semana)`, value: `**${kills}** registadas`, inline: true },
        { name: `${EMOJI.ENTREGA} Entregas (Semana)`, value: `**${deliv}** registadas`, inline: true },
        { name: `${EMOJI.OK} Metas`, value: `**${goals}** activas`, inline: true },
        {
          name: `${EMOJI.ERRO} Incidentes`,
          value: inc > 0 ? `**${inc}** abertos ${EMOJI.WARN}` : `**0** abertos ${EMOJI.OK}`,
          inline: true,
        },
        { name: `${EMOJI.INFO} Cores`, value: '🟢 Criar · 🔵 Ver · 🟠 Gerir', inline: true }
      )
  );

  // Row 1 — 🟢 CRIAR (gestão da firma)
  const row1 = buttonRow(
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

  // Row 2 — 🔵 VER (dashboards e relatórios)
  const row2 = buttonRow(
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

  // Row 3 — 🟠 GERIR (administração da firma — compressão via select menu)
  const row3 = selectRow(
    selectMenu({
      customId: 'panel::chefia_gerir',
      placeholder: '🟠 Gerir — escolhe uma acção',
      options: [
        {
          label: 'Ajustar Stock',
          value: 'chefia::ajustar_stock',
          emoji: EMOJI.AJUSTAR,
          description: 'Corrigir quantidades de stock',
        },
        {
          label: 'Gerir Materiais',
          value: 'chefia::gerir_materiais',
          emoji: EMOJI.EDITAR,
          description: 'Adicionar/remover itens do catálogo',
        },
        { label: 'Promover', value: 'chefia::promover', emoji: EMOJI.PROGRESSO, description: 'Promover bairristas' },
        {
          label: 'Lifecycle',
          value: 'chefia::lifecycle',
          emoji: EMOJI.PARTICIPANTE,
          description: 'Gerir ciclo de vida de membros',
        },
        {
          label: 'Exportar',
          value: 'chefia::exportar',
          emoji: EMOJI.DINHEIRO,
          description: 'Exportar dados para ficheiro',
        },
        {
          label: 'Sync Sheets',
          value: 'chefia::sync_sheets',
          emoji: EMOJI.REFRESH,
          description: 'Sincronizar com Google Sheets',
        },
        {
          label: 'Qualidade Dados',
          value: 'chefia::qualidade_dados',
          emoji: EMOJI.INFO,
          description: 'Ver relatório de qualidade',
        },
        {
          label: 'Republicar Painéis',
          value: 'chefia::republicar_paineis',
          emoji: '🔄',
          description: 'Republicar todos os painéis',
        },
      ],
    })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildChefiaPanel };
