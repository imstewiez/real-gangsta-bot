'use strict';
/**
 * Draft/confirmation system — shows a preview before committing.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DRAFT_STORE = new Map(); // ephemeral in-memory store

function createDraft({ type, payload, expiresAt = Date.now() + 300000 }) {
  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  DRAFT_STORE.set(id, { payload, expiresAt });
  return id;
}

function getDraft(id) {
  const draft = DRAFT_STORE.get(id);
  if (!draft) return null;
  if (Date.now() > draft.expiresAt) {
    DRAFT_STORE.delete(id);
    return null;
  }
  return draft.payload;
}

function confirmRow(draftId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`draft_confirm:${draftId}`).setLabel('✅ Confirmar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`draft_cancel:${draftId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
  );
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, draft] of DRAFT_STORE) {
    if (now > draft.expiresAt) DRAFT_STORE.delete(id);
  }
}

setInterval(cleanupExpired, 60000);

module.exports = { createDraft, getDraft, confirmRow };
