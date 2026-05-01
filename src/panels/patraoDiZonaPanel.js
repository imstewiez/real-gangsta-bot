'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { selectMenu, selectRow } = require('../shared/ui/selects');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Patrão di Zona (RENOVADO v12)
// ══════════════════════════════════════════════════════════════════════════════
// Herança: TUDO da Chefia + funções de Patrão
// Cores globais: 🟢 Criar/Registar | 🔵 Ver/Consultar | 🟠 Pessoal/Gerir
//
// NOTA: Discord limita a 5 action rows por mensagem. O painel original tinha 10
// rows e falhava sempre no bootstrap. Agora comprimido para 5 rows via select
// menu na categoria GERIR.

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

  // Row 3 — 🔵 VER (consultas base)
  const row3 = buttonRow(
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'chefia::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::ranking', label: 'Ver Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 4 — 🔵 PATRÃO (visão zona)
  const row4 = buttonRow(
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

  // Row 5 — 🟠 GERIR (compressão via select menu)
  const row5 = selectRow(
    selectMenu({
      customId: 'panel::patrao_gerir',
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
        { label: 'Tarefas', value: 'patrao::tarefas', emoji: EMOJI.ENCOMENDA, description: 'Gerir tarefas da zona' },
        { label: 'Manutenção', value: 'patrao::manutencao', emoji: EMOJI.AJUSTAR, description: 'Modo de manutenção' },
        { label: 'Simular Permissões', value: 'patrao::simular_permissoes', emoji: EMOJI.VER, description: 'Testar permissões de roles' },
        { label: 'Audit Trail', value: 'patrao::audit_trail', emoji: EMOJI.AUDIT, description: 'Ver audit trail completo' },
      ],
    })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

module.exports = { buildPatraoDiZonaPanel };
