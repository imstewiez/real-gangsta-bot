'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { BAIRRISTAS, BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');

// ══════════════════════════════════════════════════════════════════════════════
// Painel Casa — Bairrista (RENOVADO v9)
// ══════════════════════════════════════════════════════════════════════════════
// Embed rico com secções organizadas + botões agrupados por função.
// Row 1: Ações principais (entrega, movimento, ranking)
// Row 2: Utilitários (encomendar, histórico, progresso)

function buildBairristaPanel() {
  const embed = applyLogo(
    brandEmbed('HOUSE')
      .setColor(COLOR.GOLD)
      .setTitle(`${EMOJI.CASA} Painel do Bairro | Firma RedWood`)
      .setDescription(
        '**A Firma não paga conversa. Paga peso.**\n' +
          'Aqui mede-se o que trazes, o que vendes, o que entregas — e quem mete respeito à volta.\n\n' +
          `${EMOJI.ENTREGA} **Registar Material** — cada quilo conta. Sem registo, não existe.\n` +
          `${EMOJI.FIRMA} **Movimento no Bairro** — o teu peso ao vivo. Sem máscaras.\n` +
          `${EMOJI.MEDAL_1} **Ranking** — quem rende mais, sobe mais.\n` +
          `${EMOJI.ENCOMENDA} **Encomendar** — o que pedes à firma.\n\n` +
          '_Trás pedra ao bairro. O bairro devolve-te nome._'
      )
      .addFields({
        name: `${EMOJI.OK} Dica`,
        value:
          'Usa os botões abaixo para navegar. Tens também os comandos `/ajuda` e `/tutorial` se precisares de orientação.',
        inline: false,
      })
  );

  const B = BUTTONS.BAIRRISTA;

  // Row 1 — Ações principais
  const row1 = buttonRow(
    buttonFromDef('bairrista::registar_material', B.ENTREGA),
    buttonFromDef('bairrista::movimento', B.MOVIMENTO),
    buttonFromDef('bairrista::ranking', B.RANKING)
  );

  // Row 2 — Utilitários (todos com handlers válidos)
  const row2 = buttonRow(
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Secondary', emoji: EMOJI.ENCOMENDA }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.TOPO }),
    button({ customId: 'bairrista::top_semanal', label: 'Topo Semanal', style: 'Secondary', emoji: EMOJI.MEDAL_1 })
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { buildBairristaPanel };
