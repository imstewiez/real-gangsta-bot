'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { selectMenu, selectRow } = require('../shared/ui/selects');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel da Chefia — Comando (RENOVADO v12)
// ══════════════════════════════════════════════════════════════════════════════
// Herança: TUDO do Oficial + funções de Chefia
// Cores globais: 🟢 Criar/Registar | 🔵 Ver/Consultar | 🟠 Pessoal/Gerir
//
// NOTA: Discord limita a 5 action rows por mensagem. O painel original tinha 8
// rows e falhava sempre no bootstrap. Agora comprimido para 5 rows via select
// menu na categoria GERIR.

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

  // Row 2 — 🟢 SAÍDAS + OFICIAL (operações)
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

  // Row 3 — 🔵 VER (consultas)
  const row3 = buttonRow(
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'chefia::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::ranking', label: 'Ver Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 4 — 🔵 MAIS (consultas adicionais)
  const row4 = buttonRow(
    button({ customId: 'bairrista::catalogo', label: 'Ver Catálogo', style: 'Primary', emoji: EMOJI.MATERIAL }),
    button({ customId: 'bairrista::metas', label: 'Ver Metas', style: 'Primary', emoji: EMOJI.OK }),
    button({ customId: 'chefia::ver_logs', label: 'Logs', style: 'Primary', emoji: EMOJI.AUDIT }),
    button({ customId: 'chefia::listar_stickys', label: 'Stickys', style: 'Primary', emoji: EMOJI.STICKY })
  );

  // Row 5 — 🟠 GERIR (compressão via select menu para respeitar limite de 5 rows)
  const row5 = selectRow(
    selectMenu({
      customId: 'panel::chefia_gerir',
      placeholder: '🟠 Gerir — escolhe uma acção',
      options: [
        { label: 'Criar Meta', value: 'chefia::criar_meta', emoji: EMOJI.OK, description: 'Definir nova meta semanal' },
        { label: 'Criar Incidente', value: 'chefia::criar_incidente', emoji: EMOJI.ERRO, description: 'Registar novo incidente' },
        { label: 'Transferir Stock', value: 'chefia::transferir_stock', emoji: EMOJI.MOVIMENTO, description: 'Mover stock entre locais' },
        { label: 'Ausências', value: 'chefia::ausencias', emoji: EMOJI.PENDENTE, description: 'Gerir ausências da firma' },
        { label: 'Painel Pendências', value: 'chefia::painel_pendencias', emoji: EMOJI.PENDENTE, description: 'Ver todas as pendências' },
        { label: 'Relatório', value: 'chefia::relatorio', emoji: EMOJI.AUDIT, description: 'Gerar relatório semanal' },
        { label: 'Dashboard', value: 'chefia::dashboard', emoji: EMOJI.GRAFICO, description: 'Ver dashboard da firma' },
        { label: 'Inactivos', value: 'chefia::inactivos', emoji: EMOJI.WARN, description: 'Listar bairristas inactivos' },
        { label: 'Ajustar Stock', value: 'chefia::ajustar_stock', emoji: EMOJI.AJUSTAR, description: 'Corrigir quantidades de stock' },
        { label: 'Gerir Materiais', value: 'chefia::gerir_materiais', emoji: EMOJI.EDITAR, description: 'Adicionar/remover itens do catálogo' },
        { label: 'Promover', value: 'chefia::promover', emoji: EMOJI.PROGRESSO, description: 'Promover bairristas' },
        { label: 'Lifecycle', value: 'chefia::lifecycle', emoji: EMOJI.PARTICIPANTE, description: 'Gerir ciclo de vida de membros' },
        { label: 'Exportar', value: 'chefia::exportar', emoji: EMOJI.DINHEIRO, description: 'Exportar dados para ficheiro' },
        { label: 'Sync Sheets', value: 'chefia::sync_sheets', emoji: EMOJI.REFRESH, description: 'Sincronizar com Google Sheets' },
        { label: 'Qualidade Dados', value: 'chefia::qualidade_dados', emoji: EMOJI.INFO, description: 'Ver relatório de qualidade' },
        { label: 'Republicar Painéis', value: 'chefia::republicar_paineis', emoji: '🔄', description: 'Republicar todos os painéis' },
      ],
    })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

module.exports = { buildChefiaPanel };
