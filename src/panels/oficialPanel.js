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

  // Row 1 — Saídas e operações (core do Oficial)
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida',   label: 'Nova Sessão',     style: 'Success',   emoji: EMOJI.SAIDA }),
    button({ customId: 'oficial::ver_saidas',   label: 'Ver Saídas',      style: 'Primary',   emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open',    label: 'Estatísticas',    style: 'Primary',   emoji: EMOJI.TOPO }),
  );

  // Row 2 — Material + cockpit pessoal (Oficiais também são Bairristas)
  const row2 = buttonRow(
    button({ customId: 'bairrista::registar_material', label: 'Registar Material', style: 'Secondary', emoji: EMOJI.ENTREGA }),
    button({ customId: 'bairrista::movimento',         label: 'O meu Movimento',   style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::ranking',           label: 'Ranking',           style: 'Secondary', emoji: EMOJI.MEDAL_1 }),
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { buildOficialPanel };
