'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { PANELS, footer, EMOJI, MEMBER_STATS } = require('../content');
const { applyLogo } = require('../shared/embedBuilders');

function buildBairristaPanel() {
  const P = PANELS.BAIRRISTA || PANELS.MORADOR;
  const MS = MEMBER_STATS.BUTTON;
  const embed = applyLogo(new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle(P.TITLE)
    .setDescription(
      'O que fazes aqui fica registado — material, saídas, combate, lucro.\n' +
      'Cada movimento conta pro topo da semana e pra próxima subida.\n\n' +
      `${EMOJI.MATERIAL} **${P.BUTTONS.ENTREGA}** · material que trazes\n` +
      `${EMOJI.AUDIT} **${P.BUTTONS.HISTORICO}** · tudo o que passaste\n` +
      `${EMOJI.TOPO} **${P.BUTTONS.TOTAIS}** · progresso de subida\n` +
      `${EMOJI.KILL} **${MS.PERFORMANCE}** · kills, K/D, sobrevivência, MVPs\n` +
      `${EMOJI.MATERIAL} **${MS.MATERIAL}** · o que recebes e devolves\n` +
      `${EMOJI.LUCRO} **${MS.LUCRO}** · lucro gerado e top spots`
    )
    .setFooter(footer('HOUSE', CONFIG.BOT_LOGO_URL))
    .setTimestamp());

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel(P.BUTTONS.ENTREGA).setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel(P.BUTTONS.HISTORICO).setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCB'),
    new ButtonBuilder().setCustomId('morador::totais').setLabel(P.BUTTONS.TOTAIS).setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCA'),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::my_performance').setLabel(MS.PERFORMANCE).setStyle(ButtonStyle.Primary).setEmoji('\uD83C\uDFAF'),
    new ButtonBuilder().setCustomId('morador::my_material').setLabel(MS.MATERIAL).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('morador::my_profit').setLabel(MS.LUCRO).setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCB0'),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// Alias legado — código antigo importa buildMoradorPanel.
const buildMoradorPanel = buildBairristaPanel;

module.exports = { buildBairristaPanel, buildMoradorPanel };
