'use strict';
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');
const { buttonFromDef, buttonRow } = require('../shared/ui/buttons');

// Painel do Patrão di Zona.
// Publicado em canal dedicado ao patrão; gere bairristas: listar, entregas,
// vendas, topo da zona.
function buildPatraoDiZonaPanel() {
  const embed = applyLogo(brandEmbed('HOUSE')
    .setTitle(PANELS.PATRAO_DI_ZONA.TITLE)
    .setDescription(PANELS.PATRAO_DI_ZONA.DESCRIPTION));

  const B = BUTTONS.PATRAO;

  const row = buttonRow(
    buttonFromDef('chefe_mor::listar_moradores', B.LISTAR),
    buttonFromDef('chefe_mor::ver_entregas',     B.ENTREGAS),
    buttonFromDef('chefe_mor::ver_vendas',       B.VENDAS),
    buttonFromDef('chefe_mor::ver_tops',         B.TOPOS),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildPatraoDiZonaPanel };
