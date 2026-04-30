'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { PANELS, BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');

// ══════════════════════════════════════════════════════════════════════════════
// Centro de Comando — Painel da Chefia (RENOVADO v9)
// ══════════════════════════════════════════════════════════════════════════════
// Layout: 4 rows · máx 20 botões (limite Discord = 5 rows × 5 = 25).
// Organizado por domínio: Saídas | Stock | Gestão | Dados

function buildChefiaPanel() {
  const embed = applyLogo(
    brandEmbed('MOVEMENT')
      .setColor(COLOR.DANGER)
      .setTitle(`${EMOJI.LIDER} O Comando | Firma RedWood`)
      .setDescription(
        '**Aqui não se pergunta — decide-se.**\n' +
        'Daqui abre-se a rua, fecha-se a rua, aperta-se a casa. Chefia vê tudo. Chefia cobra tudo.\n\n' +
        `${EMOJI.SAIDA} **Sessões** — abrir, acompanhar, fechar.\n` +
        `${EMOJI.STOCK} **Stock** — ver, ajustar, governar o material.\n` +
        `${EMOJI.RADIO} **Gestão** — rádio, stickys, canais da firma.\n` +
        `${EMOJI.TOPO} **Dados** — topos, logs, auditoria.\n\n` +
        '_Tudo fica registado. Nada se esquece._'
      )
  );

  const B = BUTTONS.CHEFIA;
  const btn = buttonFromDef;

  // Row 1 — Saídas
  const row1 = buttonRow(
    btn('chefia::criar_saida', B.CRIAR_SAIDA),
    btn('chefia::ver_saidas', B.VER_SAIDAS)
  );

  // Row 2 — Stock
  const row2 = buttonRow(
    btn('chefia::ver_stock', B.VER_STOCK),
    btn('chefia::ajustar_stock', B.AJUSTAR_STOCK),
    btn('chefia::gerir_materiais', B.GERIR_MATERIAIS)
  );

  // Row 3 — Gestão
  const row3 = buttonRow(
    btn('chefia::listar_stickys', B.STICKYS),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Secondary', emoji: EMOJI.GRAFICO }),
    button({ customId: 'bairrista::registar_material', label: 'Registar Material', style: 'Secondary', emoji: EMOJI.ENTREGA })
  );

  // Row 4 — Dados
  const row4 = buttonRow(
    btn('chefia::ver_tops', B.TOPS),
    btn('chefia::ver_logs', B.LOGS),
    button({ customId: 'bairrista::movimento', label: 'Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Secondary', emoji: EMOJI.MEDAL_1 })
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildChefiaPanel };
