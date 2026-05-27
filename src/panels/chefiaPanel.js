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
  const safe = m || {};

  const fields = [];

  // ── Saídas ──
  fields.push(
    formatMetric({
      label: 'Saídas Activas',
      value: safe.saidas_activas ?? 0,
      emoji: EMOJI.SAIDA,
      hint: 'em curso',
      inline: true,
    }),
    formatMetric({
      label: 'Concluídas',
      value: safe.saidas_concluidas ?? 0,
      emoji: '✅',
      hint: 'esta semana',
      inline: true,
    })
  );

  // ── Membros ──
  fields.push(
    formatMetric({
      label: 'Bairristas',
      value: safe.membros_activos ?? 0,
      emoji: EMOJI.PARTICIPANTE,
      hint: 'activos',
      inline: true,
    }),
    formatMetric({
      label: 'Inactivos',
      value: safe.membros_inactivos ?? 0,
      emoji: '💤',
      hint: 'sem movimento',
      inline: true,
    }),
    formatMetric({
      label: 'Ausências',
      value: safe.ausencias_activas ?? 0,
      emoji: EMOJI.PENDENTE,
      hint: 'hoje',
      inline: true,
    })
  );

  // ── Stock & Encomendas ──
  if ((safe.stock_critico ?? 0) > 0) {
    fields.push(
      formatAlert({
        text: `**${safe.stock_critico}** item(s) com stock crítico (≤5 unidades).`,
        emoji: '📦',
        severity: 'warn',
      })
    );
  }

  fields.push(
    formatMetric({
      label: 'Encomendas',
      value: safe.enc_pendentes ?? 0,
      emoji: EMOJI.ENCOMENDA,
      hint: 'pendentes',
      inline: true,
    }),
    formatMetric({
      label: 'Em Processo',
      value: safe.enc_aprovadas ?? 0,
      emoji: '🔧',
      hint: 'aprovadas',
      inline: true,
    }),
    formatMetric({
      label: 'Entregues',
      value: safe.enc_entregues ?? 0,
      emoji: '✅',
      hint: 'esta semana',
      inline: true,
    })
  );

  // ── Movimento & PvP ──
  fields.push(
    formatMetric({
      label: 'Entregas',
      value: safe.entregas_count ?? 0,
      emoji: EMOJI.ENTREGA,
      hint: `(${fmt(safe.entregas_qty)} qty)`,
      inline: true,
    }),
    formatMetric({
      label: 'Vendas',
      value: safe.vendas_count ?? 0,
      emoji: EMOJI.VENDA,
      hint: 'esta semana',
      inline: true,
    }),
    formatMetric({
      label: 'Kills',
      value: safe.kills_semana ?? 0,
      emoji: EMOJI.KILL,
      hint: 'semana',
      inline: true,
    })
  );

  // ── Top ──
  if ((safe.top_qty ?? 0) > 0) {
    fields.push(
      formatMetric({
        label: '🏆 Top Entregador (Semana)',
        value: safe.top_nome ?? '—',
        emoji: EMOJI.MEDAL_1,
        hint: `${fmt(safe.top_qty)} qty`,
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
    [{ customId: 'chefia::ver_stock', label: 'Stock', style: 'Primary', emoji: EMOJI.STOCK }],
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
      ],
    })
  );

  components.push(rowSelect);

  return { embeds: [embed], components };
}

module.exports = { buildChefiaPanel };
