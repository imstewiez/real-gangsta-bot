'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildMoradorWelcomeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('morador::registar_material')
      .setLabel('Registar Material')
      .setStyle(ButtonStyle.Success)
      .setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder()
      .setCustomId('morador::historico')
      .setLabel('Meu Histórico')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('\uD83D\uDCCB'),
    new ButtonBuilder()
      .setCustomId('morador::totais')
      .setLabel('Meus Totais')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('\uD83D\uDCCA'),
  );
}

module.exports = { buildMoradorWelcomeButtons };
