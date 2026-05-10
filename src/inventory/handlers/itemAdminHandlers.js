'use strict';
const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { safeReply, safeShowModal, getModalField } = require('../../shared/interactionHelpers');
const { successEmbed, errorEmbed } = require('../../shared/embedBuilders');
const { inventoryRepo } = require('../../repositories');
const { isChefia } = require('../../permissions/permissionEngine');
const { requirePermission } = require('../../shared/requirePermission');
const { EMOJI, ERRORS } = require('../../content');
const { pendingItemSelections, _setItemCtx } = require('./stockHandlers');

async function handleAddItemModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = getModalField(interaction, 'name').trim();
  const category = getModalField(interaction, 'category').toLowerCase().trim();
  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));

  if (!name) return safeReply(interaction, { content: 'Nome obrigatório.' }, { messageClass: 'BANAL' });
  if (isNaN(price) || price < 0)
    return safeReply(interaction, { content: 'Preço inválido.' }, { messageClass: 'BANAL' });

  const existing = await inventoryRepo.getItemByName(name);
  if (existing) return safeReply(interaction, { content: ERRORS.ALREADY_EXISTS(name) }, { messageClass: 'BANAL' });

  await inventoryRepo.createItem({ name, category, unit: 'unidade', estimatedValue: price });

  const { logAudit } = require('../../audit/auditEngine');
  await logAudit({
    action: 'item_created',
    entityType: 'item',
    entityId: name,
    actorId: interaction.user.id,
    afterState: { name, category, price },
  });

  const embed = successEmbed('Material Adicionado', `**${name}**\nCategoria: ${category}\nPreço: **${price}\u20AC**`);
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
}

async function handleEditItemSelect(interaction) {
  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );

  _setItemCtx(interaction.user.id, { action: 'edit_price', itemId, itemName: item.name });

  const modal = new ModalBuilder()
    .setCustomId('inv::modal_edit_price')
    .setTitle(`Editar ${item.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('price')
          .setLabel(`Novo preço (atual: ${item.estimated_value || 0}\u20AC)`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder(String(item.estimated_value || 0))
      )
    );

  await safeShowModal(interaction, modal);
}

async function handleEditPriceModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending || pending.action !== 'edit_price')
    return safeReply(interaction, { content: 'Sessão expirada.' }, { messageClass: 'BANAL' });

  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));
  if (isNaN(price) || price < 0)
    return safeReply(interaction, { content: 'Preço inválido.' }, { messageClass: 'BANAL' });

  const oldItem = await inventoryRepo.getItemById(pending.itemId);
  await inventoryRepo.updateItem(pending.itemId, { estimated_value: price });
  pendingItemSelections.delete(interaction.user.id);

  const { logAudit } = require('../../audit/auditEngine');
  await logAudit({
    action: 'item_price_updated',
    entityType: 'item',
    entityId: pending.itemName,
    actorId: interaction.user.id,
    beforeState: { price: oldItem?.estimated_value },
    afterState: { price },
  });

  const embed = successEmbed(
    'Preço Atualizado',
    `**${pending.itemName}**\nPreço anterior: ${oldItem?.estimated_value || 0}\u20AC\nNovo preço: **${price}\u20AC**`
  );
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
}

async function handleDeactivateItemSelect(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferUpdate().catch(() => {});

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );

  await inventoryRepo.updateItem(itemId, { active: false });

  const { logAudit } = require('../../audit/auditEngine');
  await logAudit({
    action: 'item_deactivated',
    entityType: 'item',
    entityId: item.name,
    actorId: interaction.user.id,
  });

  const embed = successEmbed(
    'Material Desativado',
    `**${item.name}** foi removido do catálogo.\nPodes reativá-lo a qualquer momento.`
  );
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'RESULT' });
}

async function handleReactivateItemSelect(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferUpdate().catch(() => {});

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'RESULT' }
    );

  await inventoryRepo.updateItem(itemId, { active: true });

  const embed = successEmbed('Material Reativado', `**${item.name}** está novamente disponível no catálogo.`);
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'RESULT' });
}

module.exports = {
  handleAddItemModal,
  handleEditItemSelect,
  handleEditPriceModal,
  handleDeactivateItemSelect,
  handleReactivateItemSelect,
};
