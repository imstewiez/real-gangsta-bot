'use strict';
const { renderPanelEmbed, formatMetric, formatSection, buildButtonRowsByCategory, fmt } = require('../ui/panelSystem');
const { COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { getOficialMetrics } = require('../repositories/panelRepo');

// ═══════════════════════════════════════════════════════════════════════════════
// Painel do Bairrista — Atividade da Ballas Gang
// ═══════════════════════════════════════════════════════════════════════════════
// Nota: este é o painel PÚBLICO no canal. Dados pessoais aparecem em "Meu Resumo".

async function buildBairristaPanel() {
  const m = await getOficialMetrics();
  const safe = m || {};

  const fields = [];

  // ── Top 3 entregas ──
  // O panelRepo.getOficialMetrics não retorna top3; usamos query local simples
  // ou podemos criar um helper. Por simplicidade, mantemos a query local.
  const { query } = require('../db');
  const topRes = await query(`
    SELECT m.display_name, SUM(im.quantity)::int AS total_qty
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    WHERE im.movement_type IN ('entrega_bairrista','entrega_oficial')
      AND im.created_at >= date_trunc('week', NOW())
    GROUP BY m.display_name
    ORDER BY total_qty DESC
    LIMIT 3
  `);

  if (topRes.rows.length === 0) {
    fields.push(
      formatSection({ title: `${EMOJI.MEDAL_1} Top Entregas (Semana)`, lines: ['_Sem entregas esta semana._'] })
    );
  } else {
    const lines = topRes.rows.map(
      (r, i) =>
        `${i === 0 ? EMOJI.MEDAL_1 : i === 1 ? EMOJI.MEDAL_2 : EMOJI.MEDAL_3} **${r.display_name}** — ${fmt(r.total_qty)} qty`
    );
    fields.push(formatSection({ title: `${EMOJI.MEDAL_1} Top Entregas (Semana)`, lines }));
  }

  // ── Resumo rápido ──
  fields.push(
    formatMetric({
      label: 'Firma',
      value: safe.membros_activos ?? 0,
      emoji: EMOJI.PARTICIPANTE,
      hint: 'activos',
      inline: true,
    }),
    formatMetric({
      label: 'Saídas',
      value: safe.saidas_activas ?? 0,
      emoji: EMOJI.SAIDA,
      hint: 'em curso',
      inline: true,
    }),
    formatMetric({
      label: 'Movimento',
      value: (safe.entregas_count ?? 0) + (safe.vendas_count ?? 0),
      emoji: EMOJI.ENTREGA,
      hint: 'registos semana',
      inline: true,
    })
  );

  const embed = renderPanelEmbed({
    title: `${EMOJI.CASA} Painel do Bairrista`,
    subtitle: 'Atividade semanal da Ballas Gang — quem puxa, quem rende.',
    color: COLOR.GOLD,
    fields,
  });

  const components = buildButtonRowsByCategory([
    // Row 1 — Registar
    [
      { customId: 'bairrista::entregar_material', label: 'Entregar Material', style: 'Success', emoji: EMOJI.ENTREGA },
      { customId: 'bairrista::vender', label: 'Vender', style: 'Success', emoji: EMOJI.VENDA },
      { customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA },
      { customId: 'bairrista::ausencia', label: 'Ausência', style: 'Success', emoji: EMOJI.PENDENTE },
    ],
    // Row 2 — Ver
    [
      { customId: 'bairrista::ranking', label: 'Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 },
      { customId: 'bairrista::precarios', label: 'Preçários', style: 'Primary', emoji: EMOJI.DINHEIRO },
      { customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Primary', emoji: EMOJI.TOPO },
    ],
    // Row 3 — Pessoal
    [
      { customId: 'bairrista::minhas_encomendas', label: 'As Minhas Encomendas', style: 'Secondary', emoji: '📋' },
      { customId: 'bairrista::meu_resumo', label: 'Meu Resumo', style: 'Secondary', emoji: EMOJI.INFO },
    ],
  ]);

  return { embeds: [embed], components };
}

module.exports = { buildBairristaPanel };
