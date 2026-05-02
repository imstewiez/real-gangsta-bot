'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Bairrista — TUDO num só sítio (RENOVADO v12)
// ══════════════════════════════════════════════════════════════════════════════
// Herança: Base (todos os outros painéis herdam deste)
// Cores globais: 🟢 Criar/Registar | 🔵 Ver/Consultar | 🟠 Pessoal/Gerir

async function buildBairristaPanel() {
  const [weeklyTop, memberCount, openOps] = await Promise.all([
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
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
  ]);

  const top3 = weeklyTop.rows;
  const members = memberCount.rows[0]?.c ?? 0;
  const ops = openOps.rows[0]?.c ?? 0;

  const topText =
    top3.length === 0
      ? '_Sem entregas esta semana._'
      : top3
          .map(
            (r, i) =>
              `${i === 0 ? EMOJI.MEDAL_1 : i === 1 ? EMOJI.MEDAL_2 : EMOJI.MEDAL_3} **${r.display_name}** — ${Number(r.total_qty).toLocaleString('pt-PT')} qty`
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
        { name: `${EMOJI.SAIDA} Saídas`, value: `**${ops}** em curso`, inline: true },
        { name: `${EMOJI.INFO} Cores dos botões`, value: '🟢 Registar · 🔵 Ver · 🟠 Pessoal', inline: false }
      )
  );

  // Row 1 — 🟢 REGISTAR (acções principais do dia-a-dia)
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

  // Row 2 — 🟢 SUBMETER
  const row2 = buttonRow(
    button({ customId: 'bairrista::ausencia', label: 'Submeter Ausência', style: 'Success', emoji: EMOJI.PENDENTE })
  );

  // Row 3 — 🔵 VER (consultas públicas + preçários pessoal)
  const row3 = buttonRow(
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'bairrista::ranking', label: 'Ver Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 }),
    button({ customId: 'bairrista::catalogo', label: 'Ver Catálogo', style: 'Primary', emoji: EMOJI.MATERIAL }),
    button({ customId: 'bairrista::precarios', label: 'Preçários', style: 'Primary', emoji: EMOJI.DINHEIRO })
  );

  // Row 4 — 🔵 MINHAS (consultas pessoais)
  const row4 = buttonRow(
    button({ customId: 'bairrista::saidas', label: 'As minhas Saídas', style: 'Primary', emoji: EMOJI.MOVIMENTO }),
    button({ customId: 'bairrista::meu_resumo', label: 'Meu Resumo', style: 'Primary', emoji: EMOJI.INFO })
  );

  // Row 5 — 🟠 PESSOAL (cockpit individual)
  const row5 = buttonRow(
    button({ customId: 'bairrista::movimento', label: 'O meu Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.PROGRESSO }),
    button({ customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Secondary', emoji: EMOJI.TOPO })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

module.exports = { buildBairristaPanel };
