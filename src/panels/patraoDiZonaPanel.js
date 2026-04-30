'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { PANELS, BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Patrão di Zona (RENOVADO v9)
// ══════════════════════════════════════════════════════════════════════════════
// Row 1: Visão geral da zona
// Row 2: Material e dados

function buildPatraoDiZonaPanel() {
  const embed = applyLogo(
    brandEmbed('HOUSE')
      .setColor(COLOR.PURPLE)
      .setTitle(`${EMOJI.LIDER} Painel do Patrão di Zona | Firma RedWood`)
      .setDescription(
        '**A zona é tua.**\n' +
        'Vês quem puxa, vês quem some, vês quem pede puxão. Patrão conhece o bairro pelo cheiro — sabe quando dar colher, quando dar tapa.\n\n' +
        `${EMOJI.PARTICIPANTE} **Listar Bairristas** — quem anda activo.\n` +
        `${EMOJI.ENTREGA} **Entregas** — quem trás mais pedra.\n` +
        `${EMOJI.VENDA} **Vendas** — quem roda mais na rua.\n` +
        `${EMOJI.TOPO} **Topo da Zona** — os que fazem nome contigo.\n\n` +
        '_O bairro é teu. Fá-lo pesar._'
      )
  );

  const B = BUTTONS.PATRAO;

  // Row 1 — Visão geral
  const row1 = buttonRow(
    buttonFromDef('patrao::listar_bairristas', B.LISTAR),
    buttonFromDef('patrao::ver_entregas', B.ENTREGAS),
    buttonFromDef('patrao::ver_vendas', B.VENDAS),
    buttonFromDef('patrao::ver_tops', B.TOPOS)
  );

  // Row 2 — Material e utilitários
  const row2 = buttonRow(
    button({ customId: 'bairrista::registar_material', label: 'Registar Material', style: 'Secondary', emoji: EMOJI.ENTREGA }),
    button({ customId: 'bairrista::movimento', label: 'Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Secondary', emoji: EMOJI.MEDAL_1 })
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { buildPatraoDiZonaPanel };
