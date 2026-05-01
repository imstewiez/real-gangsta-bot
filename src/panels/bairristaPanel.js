'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Bairrista — TUDO num só sítio (RENOVADO v11)
// ══════════════════════════════════════════════════════════════════════════════
// Secções: 🟢 Registar | 🔵 Ver | 🟠 Pessoal
// Cores funcionais: Verde = ação · Azul = consulta · Laranja = pessoal

async function buildBairristaPanel() {
  const [weeklyTop, activeGoals, memberCount] = await Promise.all([
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

  const top3 = weeklyTop.rows;
  const goals = activeGoals.rows[0]?.c ?? 0;
  const members = memberCount.rows[0]?.c ?? 0;

  const topText =
    top3.length === 0
      ? '_Sem entregas esta semana._'
      : top3
          .map(
            (r, i) =>
              `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} **${r.display_name}** — ${Number(r.total_qty).toLocaleString('pt-PT')} qty`
          )
          .join('\n');

  const embed = applyLogo(
    brandEmbed('HOUSE')
      .setColor(COLOR.GOLD)
      .setTitle(`${EMOJI.CASA} Painel do Bairrista | Firma RedWood`)
      .setDescription('**Trás pedra ao bairro. O bairro devolve-te nome.**')
      .addFields(
        { name: `${EMOJI.MEDAL_1} Top Entregas (Semana)`, value: topText, inline: false },
        { name: `${EMOJI.PARTICIPANTE} Firma`, value: `**${members}** bairristas activos`, inline: true },
        { name: `${EMOJI.OK} Metas`, value: `**${goals}** activas esta semana`, inline: true },
        { name: `${EMOJI.INFO} Cores dos botões`, value: '🟢 Registar · 🔵 Ver · 🟠 Pessoal', inline: false }
      )
  );

  // Row 1 — 🟢 REGISTAR (acções principais)
  const row1 = buttonRow(
    button({
      customId: 'bairrista::registar_material',
      label: 'Registar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    }),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA })
  );

  // Row 2 — 🔵 VER (consulta pública)
  const row2 = buttonRow(
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 3 — 🟠 PESSOAL (cockpit individual)
  const row3 = buttonRow(
    button({ customId: 'bairrista::movimento', label: 'O meu Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.TOPO }),
    button({ customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Secondary', emoji: EMOJI.MEDAL_1 })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildBairristaPanel };
