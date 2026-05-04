'use strict';
const { renderPanelEmbed, formatMetric, buildButtonRowsByCategory, fmt } = require('../ui/panelSystem');
const { COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { getOficialMetrics } = require('../repositories/panelRepo');

// ═══════════════════════════════════════════════════════════════════════════════
// Painel do Oficial — Operações e Atividade
// ═══════════════════════════════════════════════════════════════════════════════

async function buildOficialPanel() {
  const m = await getOficialMetrics();

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

  // ── Movimento ──
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
      hint: `(${fmt(m.vendas_qty)} qty)`,
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

  // ── Firma ──
  fields.push(
    formatMetric({
      label: 'Firma',
      value: m.membros_activos,
      emoji: EMOJI.PARTICIPANTE,
      hint: 'activos',
      inline: true,
    })
  );

  const embed = renderPanelEmbed({
    title: `${EMOJI.VITORIA} Painel do Oficial`,
    subtitle: 'Operações, movimento e atividade semanal da Firma RedWood.',
    color: COLOR.INFO,
    fields,
  });

  const components = buildButtonRowsByCategory([
    // Row 1 — Ações
    [
      { customId: 'chefia::criar_saida', label: 'Abrir Saída', style: 'Success', emoji: EMOJI.NOVO },
      { customId: 'bairrista::entregar_material', label: 'Registar Material', style: 'Success', emoji: EMOJI.ENTREGA },
      { customId: 'bairrista::vender', label: 'Vender', style: 'Success', emoji: EMOJI.VENDA },
    ],
    // Row 2 — Consultas
    [
      { customId: 'bairrista::precarios', label: 'Preçários', style: 'Primary', emoji: EMOJI.DINHEIRO },
      { customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Primary', emoji: EMOJI.ENCOMENDA },
      { customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Primary', emoji: EMOJI.TOPO },
    ],
    // Row 3 — Pessoal
    [
      { customId: 'bairrista::meu_resumo', label: 'Meu Resumo', style: 'Secondary', emoji: EMOJI.INFO },
      { customId: 'bairrista::ranking', label: 'Ranking', style: 'Secondary', emoji: EMOJI.MEDAL_1 },
    ],
  ]);

  return { embeds: [embed], components };
}

module.exports = { buildOficialPanel };
