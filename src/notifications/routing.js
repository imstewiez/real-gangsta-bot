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
function setClient(client) { _client = client; }

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
  return _publish('INVENTORY_EVENTS', { embeds: [embed] });
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

function _onSaidaOpened(evt) {
  const embed = templates.saidaLifecycleEmbed({ ...evt, event: 'opened' });
  return _publish('SAIDAS_EVENTS', { embeds: [embed] });
}
function _onSaidaStarted(evt) {
  const embed = templates.saidaLifecycleEmbed({ ...evt, event: 'started' });
  return _publish('SAIDAS_EVENTS', { embeds: [embed] });
}
function _onSaidaClosed(evt) {
  // Resultado "rico" (3 embeds) continua a vir do saidaResultsPublisher —
  // este canal recebe uma versão compacta para timeline.
  const embed = templates.saidaLifecycleEmbed({ ...evt, event: 'closed' });
  return _publish('SAIDAS_EVENTS', { embeds: [embed] });
}
function _onSaidaMaterialIssued(evt) {
  const embed = templates.saidaLifecycleEmbed({ ...evt, event: 'material_issued' });
  return _publish('SAIDAS_EVENTS', { embeds: [embed] });
}
function _onSaidaParticipantAdded(evt) {
  const embed = templates.saidaLifecycleEmbed({ ...evt, event: 'participant_added' });
  return _publish('SAIDAS_EVENTS', { embeds: [embed] });
}

// Kills continuam a ter o seu publish rico próprio (publishKillToChannel)
// em killEngine. Este subscriber publica uma versão compacta no cemitério
// como fallback caso o publish directo falhe (defesa em profundidade).
function _onKillRegistered(evt) {
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
  eventBus.on('material.adjusted',   _onMaterialAdjusted);
  eventBus.on('material.transferred', _onMaterialTransferred);
  // Orders (encomendas)
  eventBus.on('order.created',   _onOrderEvent);
  eventBus.on('order.approved',  _onOrderEvent);
  eventBus.on('order.fulfilled', _onOrderEvent);
  eventBus.on('order.denied',    _onOrderEvent);
  eventBus.on('order.cancelled', _onOrderEvent);
  // Members
  eventBus.on('member.joined',            _onMemberJoined);
  eventBus.on('member.left',              _onMemberLeft);
  eventBus.on('member.promoted',          _onMemberPromoted);
  eventBus.on('member.tier_changed',      _onMemberTierChanged);
  eventBus.on('member.nickname_changed',  _onMemberNicknameChanged);
  // Saídas
  eventBus.on('saida.opened',             _onSaidaOpened);
  eventBus.on('saida.started',            _onSaidaStarted);
  eventBus.on('saida.closed',             _onSaidaClosed);
  eventBus.on('saida.material_issued',    _onSaidaMaterialIssued);
  eventBus.on('saida.participant_added',  _onSaidaParticipantAdded);
  // Kills (delegado)
  eventBus.on('kill.registered', _onKillRegistered);

  // Weapon return decisions
  eventBus.on('weapon.return_confirmed',    evt => _onWeaponDecided(evt, 'confirmada'));
  eventBus.on('weapon.return_rejected',     evt => _onWeaponDecided(evt, 'rejeitada'));
  eventBus.on('weapon.return_inconclusive', evt => _onWeaponDecided(evt, 'inconclusiva'));

  log('[NOTIF] Routing subscribers registados (3 famílias consolidadas).');
}

module.exports = {
  setClient,
  registerNotificationRouting,
};
