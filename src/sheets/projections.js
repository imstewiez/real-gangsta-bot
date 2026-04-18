'use strict';
/**
 * Sheets projections — subscriber do event bus que invalida tabs e dispara
 * `syncOne(tab)` com debounce curto para evitar rajadas.
 *
 * Mapa: evento → conjunto de tabs a sincronizar.
 * Cada tab tem o seu próprio debounce timer — uma rajada de eventos de saídas
 * não atrasa o flush de membros. Quando o timer dispara, o sync corre
 * isoladamente por tab.
 *
 * Chamado uma vez no bootstrap via registerSheetProjections().
 */

const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');

// Um evento pode tocar várias tabs. Mantém-se aqui a verdade central.
// Cobertura total: qualquer mudança relevante aparece automaticamente no
// Google Sheets sem syncs manuais.
const EVENT_TO_TABS = {
  // ── Saídas ─────────────────────────────────────────────────────────────
  'saida.opened': ['saidas', 'resumo', 'dashboard'],
  'saida.started': ['saidas'],
  'saida.closed': ['saidas', 'resumo', 'dashboard', 'membros'],
  'saida.material_issued': ['saidas', 'stock'],
  'saida.participant_added': ['saidas'],

  // ── Inventário ─────────────────────────────────────────────────────────
  'material.registered': ['stock', 'resumo', 'dashboard', 'membros'],
  'material.adjusted': ['stock', 'resumo', 'dashboard'],
  'material.transferred': ['stock', 'dashboard'],

  // ── Encomendas ─────────────────────────────────────────────────────────
  'order.created': ['stock', 'dashboard'],
  'order.approved': ['stock', 'dashboard'],
  'order.fulfilled': ['stock', 'dashboard'],
  'order.denied': ['stock'],
  'order.cancelled': ['stock'],

  // ── Vida da org ────────────────────────────────────────────────────────
  'member.joined': ['membros', 'dashboard'],
  'member.onboarded': ['membros', 'dashboard'], // tag aprovada → bairrista na DB
  'member.left': ['membros', 'resumo', 'dashboard'],
  'member.promoted': ['membros', 'dashboard'],
  'member.tier_changed': ['membros', 'resumo', 'dashboard'],
  'member.nickname_changed': ['membros'],

  // ── Kills ──────────────────────────────────────────────────────────────
  'kill.registered': ['saidas', 'dashboard'],

  // ── Weapon return confirmation ─────────────────────────────────────────
  'weapon.return_confirmed': ['saidas', 'membros', 'dashboard'],
  'weapon.return_rejected': ['saidas', 'membros', 'dashboard'],
};

const DEBOUNCE_MS = 5_000;
// Retry backoff — só usado para erros transitórios (5xx, 429, rede).
// Bugs do bot (400/403/404) falham logo, sem retry, para surfarem em logs/métricas.
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

// Estado local do subscriber — debounce por tab para que uma rajada de
// eventos num domínio (ex: saídas) não atrase o flush de outro (ex: membros).
const _timers = new Map(); // tabKey → setTimeout id
const _inFlight = new Set(); // tabs com sync a decorrer (inclui durante backoff)

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function _syncWithRetry(tab) {
  const { syncOne, isTransientSheetsError } = require('./syncEngine');
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await syncOne(tab);
    } catch (e) {
      lastErr = e;
      const canRetry = attempt < RETRY_DELAYS_MS.length && isTransientSheetsError(e);
      if (!canRetry) throw e;
      const delay = RETRY_DELAYS_MS[attempt];
      warn(`[PROJ] ${tab} transitório (tentativa ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}): ${e.message} — retry em ${delay}ms`);
      await _sleep(delay);
    }
  }
  throw lastErr; // unreachable — loop acima throws no attempt final
}

function _flushTab(tab) {
  _timers.delete(tab);
  if (_inFlight.has(tab)) {
    // Sync (ou backoff) a correr para esta tab — reagenda para apanhar o novo estado
    // depois do actual terminar. O retry não duplica in-flight porque ocupa o slot.
    _scheduleTab(tab);
    return;
  }
  _inFlight.add(tab);
  _syncWithRetry(tab)
    .then(r => {
      if (r?.skipped) {
        log(`[PROJ] ${tab} skipped: ${r.skipped}`);
      } else {
        log(`[PROJ] ${tab} sync: ${r.ops} ops em ${r.ms}ms`);
      }
    })
    .catch(e => {
      warn(`[PROJ] ${tab} falhou (após retries se aplicável): ${e.message}`);
    })
    .finally(() => {
      _inFlight.delete(tab);
      // Se chegaram mais eventos entretanto para esta tab, já há timer.
    });
}

function _scheduleTab(tab) {
  if (_timers.has(tab)) return; // já agendado
  _timers.set(
    tab,
    setTimeout(() => _flushTab(tab), DEBOUNCE_MS)
  );
}

function onDomainEvent(event) {
  return _payload => {
    const tabs = EVENT_TO_TABS[event];
    if (!tabs?.length) return;
    log(`[PROJ] evento '${event}' → tabs pendentes: ${tabs.join(', ')}`);
    for (const tab of tabs) _scheduleTab(tab);
  };
}

function registerSheetProjections() {
  for (const event of Object.keys(EVENT_TO_TABS)) {
    eventBus.on(event, onDomainEvent(event));
  }
  log(`[PROJ] Subscritos ${Object.keys(EVENT_TO_TABS).length} eventos → sheets projections.`);
}

// Exposto para testes — cancela todos os timers e faz flush imediato de todas
// as tabs pendentes.
async function _flushNow() {
  const tabs = [..._timers.keys()];
  for (const [, id] of _timers) clearTimeout(id);
  _timers.clear();
  if (!tabs.length) return [];
  const { syncOne } = require('./syncEngine');
  const results = [];
  for (const tab of tabs) {
    try {
      results.push(await syncOne(tab));
    } catch (e) {
      results.push({ tab, error: e.message });
    }
  }
  return results;
}

module.exports = {
  registerSheetProjections,
  EVENT_TO_TABS,
  DEBOUNCE_MS,
  RETRY_DELAYS_MS,
  _flushNow,
};
