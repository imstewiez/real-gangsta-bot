'use strict';
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');

// Painel do Oficial — secretaria + operações.
// "Nova Sessão" está visível a todos os Oficiais (OG + Real Gangster),
// mas o handler verifica canOpenSession — só OG, Kingpin e Manda-Chuva
// conseguem abrir efectivamente. Real Gangster clica e recebe "sem
// permissão". Isto mantém a UX honesta e a permissão estrita.
function buildOficialPanel() {
  const embed = applyLogo(brandEmbed('SHORT')
    .setTitle(PANELS.OFICIAL.TITLE)
    .setDescription(PANELS.OFICIAL.DESCRIPTION));

  const B = BUTTONS.OFICIAL;

  const row = buttonRow(
    button({ customId: 'chefia::criar_saida',   label: 'Nova Sessão',  style: 'Success',   emoji: EMOJI.SAIDA }),
    button({ customId: 'oficial::ver_saidas',   label: 'Ver Saídas',   style: 'Primary',   emoji: '🏴' }),
    buttonFromDef('morador::registar_material', B.REGISTAR),
    buttonFromDef('morador::historico',         B.MEMBROS),
    button({ customId: 'morador::totais',       label: 'Resumo',       style: 'Secondary', emoji: '🏆' }),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildOficialPanel };
