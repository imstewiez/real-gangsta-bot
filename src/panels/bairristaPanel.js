'use strict';
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { BAIRRISTAS, BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');

// Painel Casa — Bairrista.
// 4 acções: Registar Material, Meu Ponto (cockpit com drill-downs),
// Ranking, Encomendas. Tudo o que é detalhe vive dentro de "Meu Ponto"
// → drill-downs (Material, PvP, Encomendas, Histórico, Progressão).
function buildBairristaPanel() {
  const embed = applyLogo(brandEmbed('HOUSE')
    .setTitle(BAIRRISTAS.PANEL.TITLE)
    .setDescription(BAIRRISTAS.PANEL.DESCRIPTION));

  const B = BUTTONS.BAIRRISTA;

  const row1 = buttonRow(
    buttonFromDef('morador::registar_material', B.ENTREGA),
    buttonFromDef('morador::meu_ponto',         B.MEU_PONTO),
    buttonFromDef('morador::ranking',           B.RANKING),
    button({ customId: 'perfil::encomendas', label: 'Encomendas', style: 'Secondary', emoji: EMOJI.ENCOMENDA }),
  );

  return { embeds: [embed], components: [row1] };
}

module.exports = { buildBairristaPanel };
