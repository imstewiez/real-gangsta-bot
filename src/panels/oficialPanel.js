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

  // ── Movimento ──
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
      hint: `(${fmt(safe.vendas_qty)} qty)`,
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

  // ── Firma ──
  fields.push(
    formatMetric({
      label: 'Firma',
      value: safe.membros_activos ?? 0,
      emoji: EMOJI.PARTICIPANTE,
      hint: 'activos',
      inline: true,
    })
  );

  const embed = renderPanelEmbed({
    title: `${EMOJI.VITORIA} Painel do Oficial`,
    subtitle: 'Operações, movimento e atividade semanal da Ballas Gang.',
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
