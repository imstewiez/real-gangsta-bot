'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

function buildMoradorPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('Painel de Morador')
    .setDescription(
      'Usa os botões abaixo para registar material, consultar o teu histórico e os teus totais.\n\n' +
      'Todas as tuas contribuições são registadas e contam para os tops semanais.'
    )
    .setFooter({ text: CONFIG.BOT_DISPLAY_NAME })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel('Registar Material').setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel('Meu Histórico').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCB'),
    new ButtonBuilder().setCustomId('morador::totais').setLabel('Meus Totais').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCA'),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildMoradorPanel };
