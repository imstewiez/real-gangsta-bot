'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { BAIRRISTAS, BUTTONS } = require('../content');

// Painel Casa — Bairrista.
// Publicado em canais de bairristas (partilhado ou individual).
// 3 rows: acções principais, consulta, stats avançadas.
function buildBairristaPanel() {
  const embed = applyLogo(brandEmbed('HOUSE')
    .setTitle(BAIRRISTAS.PANEL.TITLE)
    .setDescription(BAIRRISTAS.PANEL.DESCRIPTION));

  const B = BUTTONS.BAIRRISTA;

  // Row 1: Acções principais
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel(B.ENTREGA.label).setStyle(ButtonStyle[B.ENTREGA.style]).setEmoji(B.ENTREGA.emoji),
    new ButtonBuilder().setCustomId('morador::meu_ponto').setLabel(B.MEU_PONTO.label).setStyle(ButtonStyle[B.MEU_PONTO.style]).setEmoji(B.MEU_PONTO.emoji),
    new ButtonBuilder().setCustomId('morador::ranking').setLabel(B.RANKING.label).setStyle(ButtonStyle[B.RANKING.style]).setEmoji(B.RANKING.emoji),
  );

  // Row 2: Consulta e progresso
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::my_performance').setLabel(B.PERFORMANCE.label).setStyle(ButtonStyle[B.PERFORMANCE.style]).setEmoji(B.PERFORMANCE.emoji),
    new ButtonBuilder().setCustomId('morador::historico').setLabel(B.HISTORICO.label).setStyle(ButtonStyle[B.HISTORICO.style]).setEmoji(B.HISTORICO.emoji),
    new ButtonBuilder().setCustomId('morador::progresso_tier').setLabel(B.PROGRESSO.label).setStyle(ButtonStyle[B.PROGRESSO.style]).setEmoji(B.PROGRESSO.emoji),
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { buildBairristaPanel };
