'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { PANELS, footer } = require('../content');
const { applyLogo } = require('../shared/embedBuilders');

function buildChefiaPanel() {
  const P = PANELS.CHEFIA;
  const embed = applyLogo(new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle(P.TITLE)
    .setDescription(P.DESCRIPTION)
    .setFooter(footer('MOVEMENT', CONFIG.BOT_LOGO_URL))
    .setTimestamp());

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::criar_saida').setLabel(P.BUTTONS.CRIAR_SAIDA).setStyle(ButtonStyle.Success).setEmoji('\u2694\uFE0F'),
    new ButtonBuilder().setCustomId('chefia::fechar_saida').setLabel(P.BUTTONS.FECHAR_SAIDA).setStyle(ButtonStyle.Danger).setEmoji('\uD83C\uDFC1'),
    new ButtonBuilder().setCustomId('chefia::ver_saidas').setLabel(P.BUTTONS.VER_SAIDAS).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCC5'),
    new ButtonBuilder().setCustomId('chefia::adicionar_participante').setLabel(P.BUTTONS.PARTICIPANTES).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDC65'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::registar_material_saida').setLabel(P.BUTTONS.MATERIAL_SAIDA).setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('chefia::fornecer_participante').setLabel(P.BUTTONS.FORNECER).setStyle(ButtonStyle.Success).setEmoji('\uD83C\uDFAF'),
    new ButtonBuilder().setCustomId('chefia::ver_stock').setLabel(P.BUTTONS.VER_STOCK).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCCA'),
    new ButtonBuilder().setCustomId('chefia::ajustar_stock').setLabel(P.BUTTONS.AJUSTAR_STOCK).setStyle(ButtonStyle.Danger).setEmoji('\uD83D\uDD27'),
    new ButtonBuilder().setCustomId('chefia::gerir_materiais').setLabel(P.BUTTONS.GERIR_MATERIAIS).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDEE0\uFE0F'),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::abrir_disponibilidade').setLabel(P.BUTTONS.DISPONIBILIDADE).setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCCD'),
    new ButtonBuilder().setCustomId('chefia::publicar_radio').setLabel(P.BUTTONS.RADIO).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCFB'),
    new ButtonBuilder().setCustomId('chefia::listar_stickys').setLabel(P.BUTTONS.STICKYS).setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCC'),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefia::ver_tops').setLabel(P.BUTTONS.TOPS).setStyle(ButtonStyle.Secondary).setEmoji('\uD83C\uDFC6'),
    new ButtonBuilder().setCustomId('chefia::stats_open').setLabel(P.BUTTONS.STATS).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCCA'),
    new ButtonBuilder().setCustomId('chefia::ver_logs').setLabel(P.BUTTONS.LOGS).setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCDD'),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildChefiaPanel };
