'use strict';
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { BAIRRISTAS, BUTTONS } = require('../content');
const { buttonFromDef, buttonRow } = require('../shared/ui/buttons');

// Painel Casa — Bairrista.
// Publicado em canais de bairristas (partilhado ou individual).
// 2 rows: acções principais, consulta e progresso.
function buildBairristaPanel() {
  const embed = applyLogo(brandEmbed('HOUSE')
    .setTitle(BAIRRISTAS.PANEL.TITLE)
    .setDescription(BAIRRISTAS.PANEL.DESCRIPTION));

  const B = BUTTONS.BAIRRISTA;

  const row1 = buttonRow(
    buttonFromDef('morador::registar_material', B.ENTREGA),
    buttonFromDef('morador::meu_ponto',         B.MEU_PONTO),
    buttonFromDef('morador::ranking',           B.RANKING),
  );

  const row2 = buttonRow(
    buttonFromDef('morador::my_performance',    B.PERFORMANCE),
    buttonFromDef('morador::historico',         B.HISTORICO),
    buttonFromDef('morador::progresso_tier',    B.PROGRESSO),
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { buildBairristaPanel };
