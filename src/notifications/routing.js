'use strict';
/**
 * Notification routing — subscribe ao event bus, route eventos para canais.
 *
 * Mapa canónico evento → família de canal:
 *
 *   member.joined / left / promoted / tier_changed / nickname_changed
 *     → ORG_LIFECYCLE
 *   material.registered / material.adjusted / material.transferred
 *     → INVENTORY_EVENTS
 *   order.created / approved / fulfilled / denied / cancelled
 *     → INVENTORY_EVENTS
 *   saida.opened / started / closed / material_issued / participant_added
 *     → SAIDAS_EVENTS
 *   kill.registered
 *     → CEMETERY
 *
 * Cada evento tem um template (src/notifications/templates.js) e é
 * publicado fire-and-forget no canal resolvido.
 */

const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');
const { resolveChannel } = require('./channels');
const templates = require('./templates');

let _client = null;
function setClient(client) {
  _client = client;
}

async function _publish(family, payload) {
  if (!_client) return;
  try {
    const ch = await resolveChannel(_client, family);
    if (!ch) return;
    await ch.send(payload).catch(e => warn(`[NOTIF:${family}] send falhou: ${e.message}`));
  } catch (e) {
    warn(`[NOTIF:${family}] ${e.message}`);
  }
}

// ── Subscribers ────────────────────────────────────────────────────────────

function _onMaterialRegistered(evt) {
  const embed = templates.inventoryMovementEmbed(evt);
  return _publish('INVENTORY_EVENTS', { embeds: [embed] });
}

function _onMaterialAdjusted(evt) {
  const embed = templates.inventoryMovementEmbed({ ...evt, movementType: 'ajuste_manual' });
  return _publish('INVENTORY_EVENTS', { embeds: [embed] });
}

function _onMaterialTransferred(evt) {
  const embed = templates.inventoryTransferEmbed(evt);
  return _publish('INVENTORY_EVENTS', { embeds: [embed] });
}

function _onOrderEvent(evt) {
  const embed = templates.orderLifecycleEmbed(evt);
  // Only post new order notifications to the dedicated orders channel.
  // Status updates (accepted/denied/delivered) are handled by editing
  // the original channel message via the button handlers.
  if (evt.status !== 'pending') return;

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`order::aceitar::${evt.orderId}`).setLabel('Aceitar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`order::recusar::${evt.orderId}`).setLabel('Recusar').setStyle(ButtonStyle.Danger)
  );
  return _publish('ORDERS', { embeds: [embed], components: [row] });
}

function _onMemberJoined(evt) {
  const embed = templates.orgLifecycleEmbed({ ...evt, event: 'joined' });
  return _publish('ORG_LIFECYCLE', { embeds: [embed] });
}
function _onMemberLeft(evt) {
  const embed = templates.orgLifecycleEmbed({ ...evt, event: 'left' });
  return _publish('ORG_LIFECYCLE', { embeds: [embed] });
}
function _onMemberPromoted(evt) {
  const embed = templates.orgLifecycleEmbed({ ...evt, event: 'promoted' });
  return _publish('ORG_LIFECYCLE', { embeds: [embed] });
}
function _onMemberTierChanged(evt) {
  const embed = templates.orgLifecycleEmbed({ ...evt, event: 'tier_changed' });
  return _publish('ORG_LIFECYCLE', { embeds: [embed] });
}
function _onMemberNicknameChanged(evt) {
  const embed = templates.orgLifecycleEmbed({ ...evt, event: 'nickname_changed' });
  return _publish('ORG_LIFECYCLE', { embeds: [embed] });
}

// SAÍDA LIFECYCLE — mute público.
// saida.opened + saida.participant_added já eram no-op (session panel cobre).
// saida.started/closed/material_issued também passam a no-op público:
//   - painel vivo (saidaSession) muda de estado visualmente
//   - saidaResultsPublisher envia 1 embed compacto no fecho (phase 1)
//   - manter NOTIFICATIONS_SAIDAS publicava 3º embed (started + closed +
//     material_issued) duplicando info já visível no painel vivo
// Eventos continuam a emitir para sheet projections e outros subscribers.
function _onSaidaStarted(_evt) {
  return Promise.resolve();
}
function _onSaidaClosed(_evt) {
  return Promise.resolve();
}
function _onSaidaMaterialIssued(_evt) {
  return Promise.resolve();
}

// Kills continuam a ter o seu publish rico próprio (publishKillToChannel)
// em killEngine. Este subscriber publica uma versão compacta no cemitério
// como fallback caso o publish directo falhe (defesa em profundidade).
function _onKillRegistered(_evt) {
  // No-op aqui — killEngine.publishKillToChannel já faz o publish rico.
  // Deixamos o subscriber registado para futura evolução.
  return Promise.resolve();
}

// ── Weapon return decisions ────────────────────────────────────────────────
function _onWeaponDecided(evt, decision) {
  const embed = templates.saidaLifecycleEmbed({
    saidaId: evt.saidaId,
    event: 'weapon_return',
    actorId: evt.actorId,
    notes: `Decisão: **${decision}** para membro #${evt.memberId}`,
    at: evt.at,
  });
  return _publish('SAIDAS_EVENTS', { embeds: [embed] });
}

function registerNotificationRouting() {
  // Inventory
  eventBus.on('material.registered', _onMaterialRegistered);
  eventBus.on('material.adjusted', _onMaterialAdjusted);
  eventBus.on('material.transferred', _onMaterialTransferred);
  // Orders (encomendas)
  eventBus.on('order.created', _onOrderEvent);
  eventBus.on('order.approved', _onOrderEvent);
  eventBus.on('order.in_progress', _onOrderEvent);
  eventBus.on('order.ready', _onOrderEvent);
  eventBus.on('order.fulfilled', _onOrderEvent);
  eventBus.on('order.denied', _onOrderEvent);
  eventBus.on('order.cancelled', _onOrderEvent);
  // Members
  eventBus.on('member.joined', _onMemberJoined);
  eventBus.on('member.left', _onMemberLeft);
  eventBus.on('member.promoted', _onMemberPromoted);
  eventBus.on('member.tier_changed', _onMemberTierChanged);
  eventBus.on('member.nickname_changed', _onMemberNicknameChanged);
  // Saídas — opened + participant_added suprimidos (redundantes com session
  // panel que é o painel vivo interactivo da saída).
  eventBus.on('saida.started', _onSaidaStarted);
  eventBus.on('saida.closed', _onSaidaClosed);
  eventBus.on('saida.material_issued', _onSaidaMaterialIssued);
  // Kills (delegado)
  eventBus.on('kill.registered', _onKillRegistered);

  // Weapon return decisions
  eventBus.on('weapon.return_confirmed', evt => _onWeaponDecided(evt, 'confirmada'));
  eventBus.on('weapon.return_rejected', evt => _onWeaponDecided(evt, 'rejeitada'));
  eventBus.on('weapon.return_inconclusive', evt => _onWeaponDecided(evt, 'inconclusiva'));

  log('[NOTIF] Routing subscribers registados (3 famílias consolidadas).');
}

module.exports = {
  setClient,
  registerNotificationRouting,
};
