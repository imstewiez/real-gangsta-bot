'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel Casa — Bairrista (RENOVADO v10)
// ══════════════════════════════════════════════════════════════════════════════
// Embed dinâmico com dados reais do bairro + botões com cores funcionais.

async function buildBairristaPanel() {
  const [weeklyRank, weeklyGoals, totalMembers] = await Promise.all([
    query(`
      SELECT m.display_name, SUM(im.qty) AS total_qty
      FROM inventory_movements im
      JOIN members m ON m.id = im.member_id
      WHERE im.movement_type IN ('entrega_morador','entrega_oficial')
        AND im.created_at >= date_trunc('week', NOW())
      GROUP BY m.display_name
      ORDER BY total_qty DESC
      LIMIT 3
    `),
    query("SELECT COUNT(*)::int AS c FROM weekly_goals WHERE status = 'active'"),
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
  ]);

  const top3 = weeklyRank.rows;
  const goalsCount = weeklyGoals.rows[0]?.c ?? 0;
  const membersCount = totalMembers.rows[0]?.c ?? 0;

  let topText = '';
  if (top3.length === 0) topText = '_Sem entregas esta semana._';
  else {
    topText = top3
      .map(
        (r, i) =>
          `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} **${r.display_name}** — ${Number(r.total_qty).toLocaleString('pt-PT')} qty`
      )
      .join('\n');
  }

  const embed = applyLogo(
    brandEmbed('HOUSE')
      .setColor(COLOR.GOLD)
      .setTitle(`${EMOJI.CASA} Painel do Bairro | Firma RedWood`)
      .setDescription('**A Firma não paga conversa. Paga peso.**')
      .addFields(
        { name: `${EMOJI.MEDAL_1} Top Entregas (Semana)`, value: topText, inline: false },
        { name: `${EMOJI.PARTICIPANTE} Bairristas`, value: `**${membersCount}** na firma`, inline: true },
        { name: `${EMOJI.OK} Metas Activas`, value: `**${goalsCount}** esta semana`, inline: true },
        { name: `${EMOJI.INFO} Dica`, value: '🟢 = registar · 🔵 = ver · 🟠 = consultar', inline: false }
      )
  );

  const B = BUTTONS.BAIRRISTA;

  // Row 1 — Criar 🟢
  const row1 = buttonRow(
    buttonFromDef('bairrista::registar_material', B.ENTREGA),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA })
  );

  // Row 2 — Ver 🔵
  const row2 = buttonRow(
    buttonFromDef('bairrista::movimento', B.MOVIMENTO),
    buttonFromDef('bairrista::ranking', B.RANKING),
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK })
  );

  // Row 3 — Consultar 🟠
  const row3 = buttonRow(
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.TOPO }),
    button({ customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Secondary', emoji: EMOJI.MEDAL_1 })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildBairristaPanel };
