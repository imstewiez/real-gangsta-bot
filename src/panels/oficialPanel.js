'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Oficial — Operações e Saídas (v13)
//
// Botões:
//   Abrir Saída  → chefia::criar_saida (só OG+ / Patrão di Zona / Comando)
//   Topo Semanal → bairrista::top_semanal
//   Registar Material → bairrista::entregar_material
//   Vender       → bairrista::vender
//   Preçários    → bairrista::precarios
//   Encomendar   → bairrista::encomendar
//   Meu Resumo   → bairrista::meu_resumo
// ══════════════════════════════════════════════════════════════════════════════

async function buildOficialPanel() {
  const [openOps, weekKills, weekDeliveries, memberCount] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
    query("SELECT COUNT(*)::int AS c FROM kill_logs WHERE created_at >= date_trunc('week', NOW())"),
    query(
      "SELECT COUNT(*)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_bairrista','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
    ),
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'ativo'"),
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

  // Row 1 — Operações + Registo
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Abrir Saída', style: 'Success', emoji: EMOJI.NOVO }),
    button({ customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Primary', emoji: EMOJI.TOPO }),
    button({
      customId: 'bairrista::entregar_material',
      label: 'Registar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    }),
    button({ customId: 'bairrista::vender', label: 'Vender', style: 'Success', emoji: EMOJI.VENDA })
  );

  // Row 2 — Consultas + Pessoal
  const row2 = buttonRow(
    button({ customId: 'bairrista::precarios', label: 'Preçários', style: 'Primary', emoji: EMOJI.DINHEIRO }),
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Success', emoji: EMOJI.ENCOMENDA }),
    button({ customId: 'bairrista::meu_resumo', label: 'Meu Resumo', style: 'Secondary', emoji: EMOJI.INFO })
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { buildOficialPanel };
