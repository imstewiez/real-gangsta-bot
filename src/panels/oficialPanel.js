'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { footer, EMOJI } = require('../content');
const { applyLogo } = require('../shared/embedBuilders');

function buildOficialPanel() {
  const embed = applyLogo(new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle(`${EMOJI.TAG} Oficial — Secretaria`)
    .setDescription(
      'Controlo de material, saídas, e quem está na rua.\n' +
      'O que registas vai para o radar da chefia.\n\n' +
      `${EMOJI.MATERIAL} **Registar Material** · entrega ou venda\n` +
      `${EMOJI.SAIDA} **Ver Saídas** · abertas e recentes\n` +
      `${EMOJI.AUDIT} **Histórico** · o teu rasto\n` +
      `${EMOJI.TOPO} **Resumo** · totais acumulados`
    )
    .setFooter(footer('SHORT', CONFIG.BOT_LOGO_URL))
    .setTimestamp());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel('Registar Material').setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('oficial::ver_saidas').setLabel('Ver Saídas').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCC5'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel('Histórico').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCB'),
    new ButtonBuilder().setCustomId('morador::totais').setLabel('Resumo').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCA'),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildOficialPanel };
