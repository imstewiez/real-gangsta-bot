'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

function buildChefeMoradoresPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('Painel — Chefe de Moradores')
    .setDescription(
      'Gestão de moradores: consultar fichas, entregas, vendas e atividade.\n' +
      'Podes acompanhar o progresso de cada morador individualmente.'
    )
    .setFooter({ text: CONFIG.BOT_DISPLAY_NAME })
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
