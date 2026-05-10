'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildPaginationButtons({ page, totalPages, customIdPrefix }) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}::prev`)
      .setLabel('◀ Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1)
  );
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}::page`)
      .setLabel(`Página ${page}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}::next`)
      .setLabel('Próximo ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  );
  return row;
}

function buildBackButton(targetCustomId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(targetCustomId)
      .setLabel('↩ Voltar')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildConfirmCancel(confirmId, cancelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel('✅ Confirmar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Danger)
  );
}

module.exports = {
  buildPaginationButtons,
  buildBackButton,
  buildConfirmCancel,
};
