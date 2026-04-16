'use strict';
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');

// Painel do Oficial — secretaria.
function buildOficialPanel() {
  const embed = applyLogo(brandEmbed('SHORT')
    .setTitle(PANELS.OFICIAL.TITLE)
    .setDescription(PANELS.OFICIAL.DESCRIPTION));

  const B = BUTTONS.OFICIAL;

  const row = buttonRow(
    buttonFromDef('morador::registar_material', B.REGISTAR),
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary',   emoji: '🏴' }),
    buttonFromDef('morador::historico',         B.MEMBROS),
    button({ customId: 'morador::totais',       label: 'Resumo',   style: 'Secondary', emoji: '🏆' }),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildOficialPanel };
