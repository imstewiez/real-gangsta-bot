'use strict';
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');
const { buttonFromDef, buttonRow } = require('../shared/ui/buttons');

// Painel do Patrão di Zona.
// Publicado em canal dedicado ao patrão; gere bairristas: listar, entregas,
// vendas, topo da zona.
function buildPatraoDiZonaPanel() {
  const embed = applyLogo(
    brandEmbed('HOUSE').setTitle(PANELS.PATRAO_DI_ZONA.TITLE).setDescription(PANELS.PATRAO_DI_ZONA.DESCRIPTION)
  );

  const B = BUTTONS.PATRAO;

  const row = buttonRow(
    buttonFromDef('patrao::listar_bairristas', B.LISTAR),
    buttonFromDef('patrao::ver_entregas', B.ENTREGAS),
    buttonFromDef('patrao::ver_vendas', B.VENDAS),
    buttonFromDef('patrao::ver_tops', B.TOPOS)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildPatraoDiZonaPanel };
