'use strict';
const { renderPanelEmbed, formatMetric, buildButtonGrid } = require('../ui/panelSystem');
const { COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button } = require('../shared/ui/buttons');
const { getEntradaMetrics } = require('../repositories/panelRepo');

// ═══════════════════════════════════════════════════════════════════════════════
// Painel de Entrada — Onboarding
// ═══════════════════════════════════════════════════════════════════════════════

async function buildEntradaPanel() {
  const m = await getEntradaMetrics();
  const safe = m || { membros_activos: 0, novos_semana: 0 };

  const fields = [];

  fields.push(
    formatMetric({
      label: 'Membros Activos',
      value: safe.membros_activos ?? 0,
      emoji: EMOJI.PARTICIPANTE,
      hint: 'na Firma',
      inline: true,
    }),
    formatMetric({
      label: 'Novos esta Semana',
      value: safe.novos_semana ?? 0,
      emoji: EMOJI.SANGUE,
      hint: 'entradas',
      inline: true,
    })
  );

  const embed = renderPanelEmbed({
    title: `${EMOJI.SANGUE} O Portão`,
    subtitle:
      'Bem-vindo à Firma RedWood. Aqui começa o teu percurso — lê as regras, pede a tua tag e mostra o que vales.',
    color: COLOR.SUCCESS,
    fields,
  });

  const components = buildButtonGrid([
    button({
      customId: 'onboard::pedir_tag',
      label: 'Dar a Cara',
      style: 'Success',
      emoji: EMOJI.TAG,
    }),
    button({
      customId: 'onboard::meu_pedido',
      label: 'Ver Regras',
      style: 'Primary',
      emoji: EMOJI.LEIS,
    }),
  ]);

  return { embeds: [embed], components };
}

module.exports = { buildEntradaPanel };
