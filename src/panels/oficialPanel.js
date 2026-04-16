'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { EMOJI, PANELS } = require('../content');

// Painel do Oficial — secretaria.
// Acesso a material, saídas, histórico, resumo.
function buildOficialPanel() {
  const embed = applyLogo(brandEmbed('SHORT')
    .setTitle(PANELS.OFICIAL.TITLE)
    .setDescription(
      'Controlo de material, saídas e quem está na rua.\n' +
      '\n' +
      `${EMOJI.MATERIAL} **Registar** · entrega ou venda\n` +
      `${EMOJI.SAIDA} **Saídas** · abertas e recentes\n` +
      `${EMOJI.AUDIT} **Histórico** · o teu rasto\n` +
      `${EMOJI.TOPO} **Resumo** · totais acumulados`
    ));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel('Registar Material').setStyle(ButtonStyle.Success).setEmoji(EMOJI.MATERIAL),
    new ButtonBuilder().setCustomId('oficial::ver_saidas').setLabel('Ver Saídas').setStyle(ButtonStyle.Primary).setEmoji(EMOJI.SAIDA),
    new ButtonBuilder().setCustomId('morador::historico').setLabel('Histórico').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.AUDIT),
    new ButtonBuilder().setCustomId('morador::totais').setLabel('Resumo').setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.TOPO),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildOficialPanel };
