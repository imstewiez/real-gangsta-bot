'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');

// Painel do Patrão di Zona.
// Publicado em canal dedicado ao patrão; gere bairristas: listar, entregas,
// vendas, topo da zona.
function buildPatraoDiZonaPanel() {
  const embed = applyLogo(brandEmbed('HOUSE')
    .setTitle(PANELS.PATRAO_DI_ZONA.TITLE)
    .setDescription(PANELS.PATRAO_DI_ZONA.DESCRIPTION));

  const B = BUTTONS.PATRAO;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefe_mor::listar_moradores').setLabel(B.LISTAR.label).setStyle(ButtonStyle[B.LISTAR.style]).setEmoji(B.LISTAR.emoji),
    new ButtonBuilder().setCustomId('chefe_mor::ver_entregas').setLabel(B.ENTREGAS.label).setStyle(ButtonStyle[B.ENTREGAS.style]).setEmoji(B.ENTREGAS.emoji),
    new ButtonBuilder().setCustomId('chefe_mor::ver_vendas').setLabel(B.VENDAS.label).setStyle(ButtonStyle[B.VENDAS.style]).setEmoji(B.VENDAS.emoji),
    new ButtonBuilder().setCustomId('chefe_mor::ver_tops').setLabel(B.TOPOS.label).setStyle(ButtonStyle[B.TOPOS.style]).setEmoji(B.TOPOS.emoji),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildPatraoDiZonaPanel };
