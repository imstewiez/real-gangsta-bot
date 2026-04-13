'use strict';
const {
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { inventoryRepo } = require('../repositories');

async function buildItemSelectMenu(customIdPrefix, placeholder = 'Seleciona o material') {
  const items = await inventoryRepo.getItems(true);

  const grouped = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const options = [];
  for (const [category, catItems] of Object.entries(grouped)) {
    for (const item of catItems.slice(0, 25)) {
      options.push({
        label: item.name,
        description: `${category} — ${item.unit}`,
        value: String(item.id),
      });
    }
  }

  if (options.length > 25) options.length = 25;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customIdPrefix)
      .setPlaceholder(placeholder)
      .setMinValues(1).setMaxValues(1)
      .addOptions(options.length ? options : [{ label: 'Sem itens', value: 'none' }])
  );
}

function buildQuantityModal(title, customId, itemName = '') {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(`Quantidade${itemName ? ` de ${itemName}` : ''}`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 10')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Observações (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Notas adicionais...')
          .setRequired(false)
          .setMaxLength(500)
      ),
    );
}

function buildOperationMaterialModal(title, customId) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Quantidade')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Observações (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      ),
    );
}

function buildStockAdjustmentModal(customId) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Ajuste Manual de Stock')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Quantidade (positivo = adicionar, negativo = retirar)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Razão do ajuste')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
      ),
    );
}

module.exports = {
  buildItemSelectMenu,
  buildQuantityModal,
  buildOperationMaterialModal,
  buildStockAdjustmentModal,
};
