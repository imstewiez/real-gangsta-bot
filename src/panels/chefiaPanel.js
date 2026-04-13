'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

function buildChefiaPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('Painel de Chefia')
    .setDescription(
      'Gestão completa de operações, inventário, membros e rankings.\n' +
      'Todas as ações são auditadas.'
    )
    .setFooter({ text: CONFIG.BOT_DISPLAY_NAME })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::criar_operacao').setLabel('Criar Operação').setStyle(ButtonStyle.Success).setEmoji('\u2694\uFE0F'),
    new ButtonBuilder().setCustomId('chefia::fechar_operacao').setLabel('Fechar Operação').setStyle(ButtonStyle.Danger).setEmoji('\uD83D\uDD12'),
    new ButtonBuilder().setCustomId('chefia::ver_operacoes').setLabel('Ver Operações').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCC5'),
    new ButtonBuilder().setCustomId('chefia::registar_material_op').setLabel('Material Operação').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCE6'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::ver_stock').setLabel('Ver Stock').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCCA'),
    new ButtonBuilder().setCustomId('chefia::ajustar_stock').setLabel('Ajustar Stock').setStyle(ButtonStyle.Danger).setEmoji('\uD83D\uDD27'),
    new ButtonBuilder().setCustomId('chefia::gerir_materiais').setLabel('Gerir Materiais').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDEE0\uFE0F'),
    new ButtonBuilder().setCustomId('chefia::ver_tops').setLabel('Ver Tops').setStyle(ButtonStyle.Secondary).setEmoji('\uD83C\uDFC6'),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::ver_logs').setLabel('Ver Logs').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCDD'),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildChefiaPanel };
