'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Oficial — Secretaria (RENOVADO v10)
// ══════════════════════════════════════════════════════════════════════════════
// Embed dinâmico com dados reais + botões com cores funcionais.

async function buildOficialPanel() {
  const [openOps, weeklyKills, weeklyDeliveries] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
    query("SELECT COUNT(*)::int AS c FROM kill_logs WHERE created_at >= date_trunc('week', NOW())"),
    query(
      "SELECT COUNT(*)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_morador','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
    ),
  ]);

  const opsCount = openOps.rows[0]?.c ?? 0;
  const killsCount = weeklyKills.rows[0]?.c ?? 0;
  const delivCount = weeklyDeliveries.rows[0]?.c ?? 0;

  const embed = applyLogo(
    brandEmbed('SHORT')
      .setColor(COLOR.INFO)
      .setTitle(`${EMOJI.VITORIA} A Secretaria | Firma RedWood`)
      .setDescription('**Aqui abre-se a rua, aqui fecha-se a conta.**')
      .addFields(
        { name: `${EMOJI.SAIDA} Saídas Activas`, value: `**${opsCount}** em curso`, inline: true },
        { name: `${EMOJI.KILL} Kills (Semana)`, value: `**${killsCount}** registadas`, inline: true },
        { name: `${EMOJI.ENTREGA} Entregas (Semana)`, value: `**${delivCount}** registadas`, inline: true },
        { name: `${EMOJI.INFO} Dica`, value: '🟢 = criar/registar · 🔵 = ver · 🟠 = pessoal', inline: false }
      )
  );

  // Row 1 — Criar 🟢
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Nova Sessão', style: 'Success', emoji: EMOJI.SAIDA }),
    button({
      customId: 'bairrista::registar_material',
      label: 'Registar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    })
  );

  // Row 2 — Ver 🔵
  const row2 = buttonRow(
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.TOPO }),
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 3 — Pessoal 🟠
  const row3 = buttonRow(
    button({ customId: 'bairrista::movimento', label: 'O meu Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Secondary', emoji: EMOJI.ENCOMENDA }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.TOPO })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildOficialPanel };
