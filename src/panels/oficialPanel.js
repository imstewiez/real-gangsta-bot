'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Oficial — Secretaria (RENOVADO v12)
// ══════════════════════════════════════════════════════════════════════════════
// Herança: TUDO do Bairrista + funções de Oficial
// Cores globais: 🟢 Criar/Registar | 🔵 Ver/Consultar | 🟠 Pessoal/Gerir

async function buildOficialPanel() {
  const [openOps, weekKills, weekDeliveries, activeGoals, memberCount] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
    query("SELECT COUNT(*)::int AS c FROM kill_logs WHERE created_at >= date_trunc('week', NOW())"),
    query(
      "SELECT COUNT(*)::int AS c FROM inventory_movements WHERE movement_type IN ('entrega_morador','entrega_oficial') AND created_at >= date_trunc('week', NOW())"
    ),
    query("SELECT COUNT(*)::int AS c FROM weekly_goals WHERE status = 'active'"),
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
  ]);

  const ops = openOps.rows[0]?.c ?? 0;
  const kills = weekKills.rows[0]?.c ?? 0;
  const deliv = weekDeliveries.rows[0]?.c ?? 0;
  const goals = activeGoals.rows[0]?.c ?? 0;
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
        { name: `${EMOJI.PARTICIPANTE} Firma`, value: `**${members}** activos`, inline: true },
        { name: `${EMOJI.OK} Metas`, value: `**${goals}** activas`, inline: true },
        { name: `${EMOJI.INFO} Cores`, value: '🟢 Registar · 🔵 Ver · 🟠 Pessoal', inline: true }
      )
  );

  // Row 1 — 🟢 REGISTAR (base, herdado do bairrista)
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

  // Row 2 — 🟢 OFICIAL (operações de saída)
  const row2 = buttonRow(
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

  // Row 3 — 🔵 VER (consultas)
  const row3 = buttonRow(
    button({ customId: 'chefia::ver_stock', label: 'Ver Stock', style: 'Primary', emoji: EMOJI.STOCK }),
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::ranking', label: 'Ver Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 4 — 🔵 VER + CATALOGO
  const row4 = buttonRow(
    button({ customId: 'bairrista::catalogo', label: 'Ver Catálogo', style: 'Primary', emoji: EMOJI.MATERIAL }),
    button({ customId: 'bairrista::metas', label: 'Ver Metas', style: 'Primary', emoji: EMOJI.OK }),
    button({ customId: 'bairrista::saidas', label: 'As minhas Saídas', style: 'Primary', emoji: EMOJI.MOVIMENTO }),
    button({ customId: 'bairrista::meu_resumo', label: 'Meu Resumo', style: 'Primary', emoji: EMOJI.INFO })
  );

  // Row 5 — 🟠 PESSOAL + OFICIAL
  const row5 = buttonRow(
    button({ customId: 'bairrista::movimento', label: 'O meu Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.PROGRESSO }),
    button({ customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Secondary', emoji: EMOJI.TOPO })
  );

  // Row 6 — 🟠 OFICIAL (logs e stickys)
  const row6 = buttonRow(
    button({ customId: 'chefia::ver_logs', label: 'Logs', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'chefia::listar_stickys', label: 'Stickys', style: 'Secondary', emoji: EMOJI.STICKY })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5, row6] };
}

module.exports = { buildOficialPanel };
