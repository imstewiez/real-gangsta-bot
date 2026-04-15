'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

function buildChefiaPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('👑 Centro de Comando')
    .setDescription(
      'Centro do movimento. Aqui manda-se a rua.\n' +
      '🏴 Saídas · 📦 Inventário · 📻 Rádio · 📍 Disponibilidade · 📌 Stickys\n\n' +
      '_Todas as acções ficam no audit log. Sem surpresas._'
    )
    .setFooter({ text: `— ${CONFIG.BOT_DISPLAY_NAME} ·` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::criar_saida').setLabel('Criar Saída').setStyle(ButtonStyle.Success).setEmoji('\u2694\uFE0F'),
    new ButtonBuilder().setCustomId('chefia::fechar_saida').setLabel('Fechar Saída').setStyle(ButtonStyle.Danger).setEmoji('\uD83C\uDFC1'),
    new ButtonBuilder().setCustomId('chefia::ver_saidas').setLabel('Ver Saídas').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCC5'),
    new ButtonBuilder().setCustomId('chefia::adicionar_participante').setLabel('Participantes').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDC65'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::registar_material_saida').setLabel('Material Saída').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('chefia::fornecer_participante').setLabel('Fornecer a Membro').setStyle(ButtonStyle.Success).setEmoji('\uD83C\uDFAF'),
    new ButtonBuilder().setCustomId('chefia::ver_stock').setLabel('Ver Stock').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCCA'),
    new ButtonBuilder().setCustomId('chefia::ajustar_stock').setLabel('Ajustar Stock').setStyle(ButtonStyle.Danger).setEmoji('\uD83D\uDD27'),
    new ButtonBuilder().setCustomId('chefia::gerir_materiais').setLabel('Gerir Materiais').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDEE0\uFE0F'),
  );

  // Row 3 — novos sistemas (Fase 3-5)
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::abrir_disponibilidade').setLabel('Disponibilidade Hoje').setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCCD'),
    new ButtonBuilder().setCustomId('chefia::publicar_radio').setLabel('Painel Rádio').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCFB'),
    new ButtonBuilder().setCustomId('chefia::listar_stickys').setLabel('Stickys').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCC'),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::ver_tops').setLabel('Ver Tops').setStyle(ButtonStyle.Secondary).setEmoji('\uD83C\uDFC6'),
    new ButtonBuilder().setCustomId('chefia::stats_open').setLabel('Estatísticas').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCCA'),
    new ButtonBuilder().setCustomId('chefia::ver_logs').setLabel('Ver Logs').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCDD'),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildChefiaPanel };
