'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

function buildMoradorPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('🏚️ Painel do Morador')
    .setDescription(
      'O que fazes aqui fica registado — material entregue, vendas, progresso.\n' +
      'Cada movimento conta pros tops da semana e pra próxima subida de tier.\n\n' +
      '📦 **Registar Material** · entrega ou venda\n' +
      '📋 **Meu Histórico** · tudo o que passaste\n' +
      '📊 **Meus Totais** · quanto já cresceste'
    )
    .setFooter({ text: `— ${CONFIG.BOT_DISPLAY_NAME} ·` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel('Registar Material').setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel('Meu Histórico').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCB'),
    new ButtonBuilder().setCustomId('morador::totais').setLabel('Meus Totais').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCA'),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildMoradorPanel };
