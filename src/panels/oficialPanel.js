'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');

// Painel do Oficial — secretaria.
function buildOficialPanel() {
  const embed = applyLogo(brandEmbed('SHORT')
    .setTitle(PANELS.OFICIAL.TITLE)
    .setDescription(PANELS.OFICIAL.DESCRIPTION));

  const B = BUTTONS.OFICIAL;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel(B.REGISTAR.label).setStyle(ButtonStyle[B.REGISTAR.style]).setEmoji(B.REGISTAR.emoji),
    new ButtonBuilder().setCustomId('oficial::ver_saidas').setLabel('Ver Saídas').setStyle(ButtonStyle.Primary).setEmoji('🏴'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel(B.MEMBROS.label).setStyle(ButtonStyle[B.MEMBROS.style]).setEmoji(B.MEMBROS.emoji),
    new ButtonBuilder().setCustomId('morador::totais').setLabel('Resumo').setStyle(ButtonStyle.Secondary).setEmoji('🏆'),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildOficialPanel };
