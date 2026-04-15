'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { footer, EMOJI } = require('../content');
const { applyLogo } = require('../shared/embedBuilders');

function buildChefeMoradoresPanel() {
  const embed = applyLogo(new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle(`${EMOJI.LIDER} Chefe de Moradores`)
    .setDescription(
      'És o elo entre os moradores e a chefia. Olha quem rende, quem some, quem precisa de puxão.\n\n' +
      `${EMOJI.PARTICIPANTE} **Listar** · quem está na casa\n` +
      `${EMOJI.MATERIAL} **Entregas** · topo por material entregue\n` +
      `${EMOJI.LUCRO} **Vendas** · topo por material vendido\n` +
      `${EMOJI.TOPO} **Topo** · ranking semanal`
    )
    .setFooter(footer('HOUSE', CONFIG.BOT_LOGO_URL))
    .setTimestamp());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('chefe_mor::listar_moradores').setLabel('Listar Moradores').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDC65'),
    new ButtonBuilder().setCustomId('chefe_mor::ver_entregas').setLabel('Ver Entregas').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('chefe_mor::ver_vendas').setLabel('Ver Vendas').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCB0'),
    new ButtonBuilder().setCustomId('chefe_mor::ver_tops').setLabel('Ver Topo').setStyle(ButtonStyle.Secondary).setEmoji('\uD83C\uDFC6'),
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildChefeMoradoresPanel };
