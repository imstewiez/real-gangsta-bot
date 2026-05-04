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
const { getPatraoMetrics } = require('../repositories/panelRepo');

// ═══════════════════════════════════════════════════════════════════════════════
// Painel do Patrão di Zona — Gestão do Bairro
// ═══════════════════════════════════════════════════════════════════════════════

async function buildPatraoDiZonaPanel() {
  const m = await getPatraoMetrics();
  const safe = m || {};

  const fields = [];

  // ── Membros ──
  fields.push(
    formatMetric({
      label: 'Bairristas',
      value: safe.bairristas_activos ?? 0,
      emoji: EMOJI.PARTICIPANTE,
      hint: 'activos',
      inline: true,
    }),
    formatMetric({
      label: 'Inactivos',
      value: safe.bairristas_inactivos ?? 0,
      emoji: '💤',
      hint: 'sem movimento',
      inline: true,
    })
  );

  // ── Movimento ──
  fields.push(
    formatMetric({
      label: 'Entregas',
      value: fmt(safe.entregas_qty),
      emoji: EMOJI.ENTREGA,
      hint: 'qty semana',
      inline: true,
    }),
    formatMetric({
      label: 'Vendas',
      value: fmt(safe.vendas_qty),
      emoji: EMOJI.VENDA,
      hint: 'qty semana',
      inline: true,
    })
  );

  // ── Top ──
  if ((safe.top_qty ?? 0) > 0) {
    fields.push(
      formatMetric({
        label: '🏆 Top da Zona',
        value: safe.top_nome ?? '—',
        emoji: EMOJI.MEDAL_1,
        hint: `${fmt(safe.top_qty)} qty`,
        inline: false,
      })
    );
  }

  // ── Alerta: inactivos na semana ──
  const inactivos = safe.inactivos_semana || [];
  if (inactivos.length > 0) {
    const nomes = inactivos.map(i => i.nome).join(', ');
    fields.push(
      formatAlert({
        text: `Sem entregas esta semana: **${nomes}**`,
        emoji: '⚠️',
        severity: 'info',
      })
    );
  }

  const embed = renderPanelEmbed({
    title: `${EMOJI.LIDER} Painel do Patrão di Zona`,
    subtitle: 'Visão do bairro — quem puxa, quem some, quem precisa de atenção.',
    color: COLOR.PURPLE,
    fields,
  });

  const components = buildButtonRowsByCategory([
    // Row 1
    [
      {
        customId: 'patrao::listar_bairristas',
        label: 'Listar Bairristas',
        style: 'Success',
        emoji: EMOJI.PARTICIPANTE,
      },
      { customId: 'patrao::ver_entregas', label: 'Ver Entregas', style: 'Success', emoji: EMOJI.ENTREGA },
      { customId: 'patrao::ver_vendas', label: 'Ver Vendas', style: 'Success', emoji: EMOJI.VENDA },
      { customId: 'patrao::ver_tops', label: 'Top da Zona', style: 'Primary', emoji: EMOJI.TOPO },
    ],
  ]);

  return { embeds: [embed], components };
}

module.exports = { buildPatraoDiZonaPanel };
