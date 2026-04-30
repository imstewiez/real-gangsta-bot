'use strict';
const { itemAdminRepo } = require('../repositories');
const { log, warn } = require('../logger');

async function listItems(filters) {
  return itemAdminRepo.listAll(filters);
}

async function createItem(payload, createdBy) {
  const item = await itemAdminRepo.create({ ...payload, createdBy });
  log('[ItemAdmin] Criado item', item.id, item.name, 'por', createdBy);
  return item;
}

async function updateItem(id, fields, changedBy) {
  const item = await itemAdminRepo.update(id, fields, changedBy);
  log('[ItemAdmin] Actualizado item', id, 'por', changedBy);
  return item;
}

async function toggleItemActive(id, active) {
  return itemAdminRepo.toggleActive(id, active);
}

async function getItemHistory(itemId) {
  return itemAdminRepo.getPriceHistory(itemId);
}

module.exports = { listItems, createItem, updateItem, toggleItemActive, getItemHistory };
