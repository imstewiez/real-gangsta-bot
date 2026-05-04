'use strict';
const {
  renderPanelEmbed,
  formatMetric,
  formatAlert,

  buildButtonRowsByCategory,
  fmt,
} = require('../ui/panelSystem');
const { COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { getChefiaMetrics } = require('../repositories/panelRepo');
const { selectMenu, selectRow } = require('../shared/ui/selects');

// ═══════════════════════════════════════════════════════════════════════════════
// Painel da Chefia — Visão Estratégica e Operacional
// ═══════════════════════════════════════════════════════════════════════════════

async function buildChefiaPanel() {
  const m = await getChefiaMetrics();

  const fields = [];

  // ── Saídas ──
  fields.push(
    formatMetric({
      label: 'Saídas Activas',
      value: m.saidas_activas,
      emoji: EMOJI.SAIDA,
      hint: 'em curso',
      inline: true,
    }),
    formatMetric({
      label: 'Concluídas',
      value: m.saidas_concluidas,
      emoji: '✅',
      hint: 'esta semana',
      inline: true,
    })
  );

  // ── Membros ──
  fields.push(
    formatMetric({
      label: 'Bairristas',
      value: m.membros_activos,
      emoji: EMOJI.PARTICIPANTE,
      hint: 'activos',
      inline: true,
    }),
    formatMetric({
      label: 'Inactivos',
      value: m.membros_inactivos,
      emoji: '💤',
      hint: 'sem movimento',
      inline: true,
    }),
    formatMetric({
      label: 'Ausências',
      value: m.ausencias_activas,
      emoji: EMOJI.PENDENTE,
      hint: 'hoje',
      inline: true,
    })
  );

  // ── Stock & Encomendas ──
  if (m.stock_critico > 0) {
    fields.push(
      formatAlert({
        text: `**${m.stock_critico}** item(s) com stock crítico (≤5 unidades).`,
        emoji: '📦',
        severity: 'warn',
      })
    );
  }

  fields.push(
    formatMetric({
      label: 'Encomendas',
      value: m.enc_pendentes,
      emoji: EMOJI.ENCOMENDA,
      hint: 'pendentes',
      inline: true,
    }),
    formatMetric({
      label: 'Em Processo',
      value: m.enc_aprovadas,
      emoji: '🔧',
      hint: 'aprovadas',
      inline: true,
    }),
    formatMetric({
      label: 'Entregues',
      value: m.enc_entregues,
      emoji: '✅',
      hint: 'esta semana',
      inline: true,
    })
  );

  // ── Movimento & PvP ──
  fields.push(
    formatMetric({
      label: 'Entregas',
      value: m.entregas_count,
      emoji: EMOJI.ENTREGA,
      hint: `(${fmt(m.entregas_qty)} qty)`,
      inline: true,
    }),
    formatMetric({
      label: 'Vendas',
      value: m.vendas_count,
      emoji: EMOJI.VENDA,
      hint: 'esta semana',
      inline: true,
    }),
    formatMetric({
      label: 'Kills',
      value: m.kills_semana,
      emoji: EMOJI.KILL,
      hint: 'semana',
      inline: true,
    })
  );

  // ── Top ──
  if (m.top_qty > 0) {
    fields.push(
      formatMetric({
        label: '🏆 Top Entregador (Semana)',
        value: m.top_nome,
        emoji: EMOJI.MEDAL_1,
        hint: `${fmt(m.top_qty)} qty`,
        inline: false,
      })
    );
  }

  const embed = renderPanelEmbed({
    title: `${EMOJI.LIDER} Painel da Chefia`,
    subtitle: 'Visão geral da Firma RedWood — operações, membros, stock e movimento.',
    color: COLOR.DANGER,
    fields,
  });

  // Botões organizados por categoria
  const components = buildButtonRowsByCategory([
    // Row 1 — Ações principais
    [
      { customId: 'chefia::criar_saida', label: 'Abrir Saída', style: 'Success', emoji: EMOJI.NOVO },
      { customId: 'chefia::gerir_encomendas', label: 'Gerir Encomendas', style: 'Success', emoji: EMOJI.ENCOMENDA },
    ],
    // Row 2 — Consultas
    [
      { customId: 'chefia::painel_pendencias', label: 'Pendências', style: 'Primary', emoji: EMOJI.PENDENTE },
      { customId: 'chefia::relatorio', label: 'Relatório', style: 'Primary', emoji: EMOJI.AUDIT },
      { customId: 'chefia::ver_stock', label: 'Stock', style: 'Primary', emoji: EMOJI.STOCK },
    ],
    // Row 3 — Gestão (select menu)
  ]);

  // Row 4 — Select de gestão
  const rowSelect = selectRow(
    selectMenu({
      customId: 'panel::chefia_gerir',
      placeholder: `${EMOJI.EM_CURSO} Gerir — escolhe uma acção`,
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
        {
          label: 'Republicar Painéis',
          value: 'chefia::republicar_paineis',
          emoji: EMOJI.REFRESH,
          description: 'Republicar todos os painéis',
        },
      ],
    })
  );

  components.push(rowSelect);

  return { embeds: [embed], components };
}

module.exports = { buildChefiaPanel };
