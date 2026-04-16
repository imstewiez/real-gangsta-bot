'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');

// Painel Casa — Bairrista.
// Publicado em canais de bairristas (partilhado ou individual).
// Mostra acções diárias: registar material, ver progresso, performance, material, lucro.
function buildBairristaPanel() {
  const embed = applyLogo(brandEmbed('HOUSE')
    .setTitle(PANELS.BAIRRISTA.TITLE)
    .setDescription(PANELS.BAIRRISTA.DESCRIPTION));

  const B = BUTTONS.BAIRRISTA;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel(B.ENTREGA.label).setStyle(ButtonStyle[B.ENTREGA.style]).setEmoji(B.ENTREGA.emoji),
    new ButtonBuilder().setCustomId('morador::historico').setLabel(B.HISTORICO.label).setStyle(ButtonStyle[B.HISTORICO.style]).setEmoji(B.HISTORICO.emoji),
    new ButtonBuilder().setCustomId('morador::totais').setLabel(B.TOTAIS.label).setStyle(ButtonStyle[B.TOTAIS.style]).setEmoji(B.TOTAIS.emoji),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::my_performance').setLabel(B.PERFORMANCE.label).setStyle(ButtonStyle[B.PERFORMANCE.style]).setEmoji(B.PERFORMANCE.emoji),
    new ButtonBuilder().setCustomId('morador::my_material').setLabel(B.MATERIAL.label).setStyle(ButtonStyle[B.MATERIAL.style]).setEmoji(B.MATERIAL.emoji),
    new ButtonBuilder().setCustomId('morador::my_profit').setLabel(B.LUCRO.label).setStyle(ButtonStyle[B.LUCRO.style]).setEmoji(B.LUCRO.emoji),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// Alias legado — código antigo importa buildMoradorPanel.
const buildMoradorPanel = buildBairristaPanel;

module.exports = { buildBairristaPanel, buildMoradorPanel };
