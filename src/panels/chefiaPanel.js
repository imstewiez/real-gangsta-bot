'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Centro de Comando — Painel da Chefia (RENOVADO v10)
// ══════════════════════════════════════════════════════════════════════════════
// Embed dinâmico com dados reais da DB + botões com cores funcionais.
// Cores: 🟢 Criar | 🔵 Ver | 🟠 Gerir

async function buildChefiaPanel() {
  const [openOps, stockAgg, topWeekly, openIncidents, activeMembers] = await Promise.all([
    query("SELECT COUNT(*)::int AS c FROM operations WHERE status IN ('aberta','em_curso')"),
    query(
      'SELECT COUNT(DISTINCT item_id)::int AS items, COALESCE(SUM(balance),0)::int AS units FROM inventory_stock_snapshot'
    ),
    query(`
      SELECT m.display_name, SUM(im.qty) AS total_qty
      FROM inventory_movements im
      JOIN members m ON m.id = im.member_id
      WHERE im.movement_type IN ('entrega_morador','entrega_oficial')
        AND im.created_at >= date_trunc('week', NOW())
      GROUP BY m.display_name
      ORDER BY total_qty DESC
      LIMIT 1
    `),
    query("SELECT COUNT(*)::int AS c FROM incidents WHERE estado = 'open'"),
    query("SELECT COUNT(*)::int AS c FROM members WHERE status = 'active'"),
  ]);

  const opsCount = openOps.rows[0]?.c ?? 0;
  const stockItems = stockAgg.rows[0]?.items ?? 0;
  const stockUnits = stockAgg.rows[0]?.units ?? 0;
  const topName = topWeekly.rows[0]?.display_name ?? '—';
  const topQty = topWeekly.rows[0]?.total_qty ?? 0;
  const incCount = openIncidents.rows[0]?.c ?? 0;
  const membersCount = activeMembers.rows[0]?.c ?? 0;

  const embed = applyLogo(
    brandEmbed('MOVEMENT')
      .setColor(COLOR.DANGER)
      .setTitle(`${EMOJI.LIDER} O Comando | Firma RedWood`)
      .setDescription(
        '**Aqui não se pergunta — decide-se.**\n' + 'Daqui abre-se a rua, fecha-se a rua, aperta-se a casa.'
      )
      .addFields(
        { name: `${EMOJI.SAIDA} Saídas Activas`, value: `**${opsCount}** em curso`, inline: true },
        {
          name: `${EMOJI.STOCK} Stock`,
          value: `**${stockItems}** itens · **${stockUnits.toLocaleString('pt-PT')}** un`,
          inline: true,
        },
        { name: `${EMOJI.PARTICIPANTE} Bairristas`, value: `**${membersCount}** activos`, inline: true },
        {
          name: `${EMOJI.MEDAL_1} Top Entregador (Semana)`,
          value: `**${topName}** — ${topQty.toLocaleString('pt-PT')} qty`,
          inline: true,
        },
        {
          name: `${EMOJI.ERRO} Incidentes`,
          value: incCount > 0 ? `**${incCount}** abertos ⚠️` : '**0** abertos ✅',
          inline: true,
        },
        { name: `${EMOJI.INFO} Dica`, value: '🟢 = criar · 🔵 = ver · 🟠 = gerir', inline: true }
      )
  );

  const B = BUTTONS.CHEFIA;

  // Row 1 — Criar 🟢
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Abrir Saída', style: 'Success', emoji: EMOJI.NOVO }),
    button({
      customId: 'bairrista::registar_material',
      label: 'Registar Material',
      style: 'Success',
      emoji: EMOJI.ENTREGA,
    })
  );

  // Row 2 — Ver 🔵
  const row2 = buttonRow(
    buttonFromDef('chefia::ver_saidas', B.VER_SAIDAS),
    buttonFromDef('chefia::ver_stock', B.VER_STOCK),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Primary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 3 — Gerir 🟠
  const row3 = buttonRow(
    buttonFromDef('chefia::ajustar_stock', B.AJUSTAR_STOCK),
    buttonFromDef('chefia::gerir_materiais', B.GERIR_MATERIAIS),
    buttonFromDef('chefia::listar_stickys', B.STICKYS),
    button({ customId: 'bairrista::movimento', label: 'Movimento', style: 'Secondary', emoji: EMOJI.FIRMA })
  );

  // Row 4 — Dados 🟠
  const row4 = buttonRow(
    buttonFromDef('chefia::ver_tops', B.TOPS),
    buttonFromDef('chefia::ver_logs', B.LOGS),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildChefiaPanel };
