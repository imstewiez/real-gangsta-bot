'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

function buildChefeMoradoresPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('🔱 Patrão di Zona')
    .setDescription(
      'Olho na malta. Acompanha quem está a produzir, quem está a dormir.\n\n' +
      '👥 **Listar** · quem está no GUETTO\n' +
      '📦 **Entregas** · ranking por material entregue\n' +
      '💰 **Vendas** · ranking por material vendido\n' +
      '🏆 **Tops** · ranking semanal dos moradores'
    )
    .setFooter({ text: `— ${CONFIG.BOT_DISPLAY_NAME} ·` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefe_mor::listar_moradores').setLabel('Listar Moradores').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDC65'),
    new ButtonBuilder().setCustomId('chefe_mor::ver_entregas').setLabel('Ver Entregas').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('chefe_mor::ver_vendas').setLabel('Ver Vendas').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCB0'),
    new ButtonBuilder().setCustomId('chefe_mor::ver_tops').setLabel('Ver Tops Moradores').setStyle(ButtonStyle.Secondary).setEmoji('\uD83C\uDFC6'),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildChefeMoradoresPanel };
