'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Oficial — Operações e Saídas (SIMPLIFICADO)
// ══════════════════════════════════════════════════════════════════════════════
// Abrir/fechar saídas, emitir material, gerir participantes, ver operações.

async function buildOficialPanel() {
  const [openOps, weekKills, weekDeliveries, memberCount] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
    query("SELECT COUNT(*)::int AS c FROM kill_logs WHERE created_at >= date_trunc('week', NOW())"),
    query(
      "SELECT COUNT(*)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_bairrista','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
    ),
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
  ]);

  const ops = openOps.rows[0]?.c ?? 0;
  const kills = weekKills.rows[0]?.c ?? 0;
  const deliv = weekDeliveries.rows[0]?.c ?? 0;
  const members = memberCount.rows[0]?.c ?? 0;

  const embed = applyLogo(
    brandEmbed('SHORT')
      .setColor(COLOR.INFO)
      .setTitle(`${EMOJI.VITORIA} Painel do Oficial | Firma RedWood`)
      .setDescription('**Aqui abre-se a rua, aqui fecha-se a conta.**')
      .addFields(
        { name: `${EMOJI.SAIDA} Saídas Activas`, value: `**${ops}** em curso`, inline: true },
        { name: `${EMOJI.KILL} Kills (Semana)`, value: `**${kills}** registadas`, inline: true },
        { name: `${EMOJI.ENTREGA} Entregas (Semana)`, value: `**${deliv}** registadas`, inline: true },
        { name: `${EMOJI.PARTICIPANTE} Firma`, value: `**${members}** activos`, inline: true }
      )
  );

  // Row 1 — Operações
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Abrir Saída', style: 'Success', emoji: EMOJI.NOVO }),
    button({ customId: 'chefia::fechar_saida', label: 'Fechar Saída', style: 'Success', emoji: EMOJI.FECHAR }),
    button({ customId: 'oficial::emitir_material', label: 'Emitir Material', style: 'Success', emoji: EMOJI.FORNECER }),
    button({
      customId: 'oficial::add_participante',
      label: 'Add Participante',
      style: 'Success',
      emoji: EMOJI.PARTICIPANTE,
    })
  );

  // Row 2 — Ver
  const row2 = buttonRow(
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'chefia::ver_logs', label: 'Logs', style: 'Primary', emoji: EMOJI.AUDIT })
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { buildOficialPanel };
