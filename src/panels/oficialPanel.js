'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

function buildOficialPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('🎖️ Painel de Oficial')
    .setDescription(
      'Controlo operacional — materiais, saídas, acompanhamento.\n' +
      'Tudo o que registas fica no radar da chefia.\n\n' +
      '📦 **Registar Material** · entrega/venda\n' +
      '📅 **Ver Operações** · saídas abertas e recentes\n' +
      '📋 **Histórico** · o teu movimento\n' +
      '📊 **Resumo** · totais acumulados'
    )
    .setFooter({ text: `— ${CONFIG.BOT_DISPLAY_NAME} ·` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel('Registar Material').setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('oficial::ver_operacoes').setLabel('Ver Operações').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCC5'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel('Meu Histórico').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCB'),
    new ButtonBuilder().setCustomId('morador::totais').setLabel('Meu Resumo').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCA'),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildOficialPanel };
