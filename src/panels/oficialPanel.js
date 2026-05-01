'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Oficial — Secretaria (RENOVADO v11)
// ══════════════════════════════════════════════════════════════════════════════
// Secções: 🟢 Operações/Registar | 🔵 Ver | 🟠 Pessoal

async function buildOficialPanel() {
  const [openOps, weekKills, weekDeliveries] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
    query("SELECT COUNT(*)::int AS c FROM kill_logs WHERE created_at >= date_trunc('week', NOW())"),
    query(
      "SELECT COUNT(*)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_morador','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
    ),
  ]);

  const ops = openOps.rows[0]?.c ?? 0;
  const kills = weekKills.rows[0]?.c ?? 0;
  const deliv = weekDeliveries.rows[0]?.c ?? 0;

  const embed = applyLogo(
    brandEmbed('SHORT')
      .setColor(COLOR.INFO)
      .setTitle(`${EMOJI.VITORIA} Painel do Oficial | Firma RedWood`)
      .setDescription('**Aqui abre-se a rua, aqui fecha-se a conta.**')
      .addFields(
        { name: `${EMOJI.SAIDA} Saídas Activas`, value: `**${ops}** em curso`, inline: true },
        { name: `${EMOJI.KILL} Kills (Semana)`, value: `**${kills}** registadas`, inline: true },
        { name: `${EMOJI.ENTREGA} Entregas (Semana)`, value: `**${deliv}** registadas`, inline: true },
        { name: `${EMOJI.INFO} Cores dos botões`, value: '🟢 Criar/Registar · 🔵 Ver · 🟠 Pessoal', inline: false }
      )
  );

  // Row 1 — 🟢 CRIAR / REGISTAR
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Nova Sessão', style: 'Success', emoji: EMOJI.SAIDA }),
    button({
      customId: 'bairrista::registar_material',
      label: 'Registar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    }),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA })
  );

  // Row 2 — 🔵 VER
  const row2 = buttonRow(
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 3 — 🟠 PESSOAL
  const row3 = buttonRow(
    button({ customId: 'bairrista::movimento', label: 'O meu Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.TOPO })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildOficialPanel };
