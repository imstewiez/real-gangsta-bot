'use strict';
/**
 * Sheets projections — subscriber do event bus que invalida tabs e dispara
 * `syncOne(tab)` com debounce curto para evitar rajadas.
 *
 * Mapa: evento → conjunto de tabs a sincronizar.
 * Cada invalidação reinicia o debounce timer. Quando dispara, o sync corre
 * por cada tab em fila — bugs numa tab não param as outras.
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
  'saida.opened':           ['saidas', 'resumo', 'dashboard'],
  'saida.started':          ['saidas'],
  'saida.closed':           ['saidas', 'resumo', 'dashboard', 'membros'],
  'saida.material_issued':  ['saidas', 'stock'],
  'saida.participant_added':['saidas'],

  // ── Inventário ─────────────────────────────────────────────────────────
  'material.registered':    ['stock', 'resumo', 'dashboard', 'membros'],
  'material.adjusted':      ['stock', 'resumo', 'dashboard'],
  'material.transferred':   ['stock', 'dashboard'],

  // ── Encomendas ─────────────────────────────────────────────────────────
  'order.created':          ['stock', 'dashboard'],
  'order.approved':         ['stock', 'dashboard'],
  'order.fulfilled':        ['stock', 'dashboard'],
  'order.denied':           ['stock'],
  'order.cancelled':        ['stock'],

  // ── Vida da org ────────────────────────────────────────────────────────
  'member.joined':          ['membros', 'dashboard'],
  'member.onboarded':       ['membros', 'dashboard'],  // tag aprovada → bairrista na DB
  'member.left':            ['membros', 'resumo', 'dashboard'],
  'member.promoted':        ['membros', 'dashboard'],
  'member.tier_changed':    ['membros', 'resumo', 'dashboard'],
  'member.nickname_changed':['membros'],

  // ── Kills ──────────────────────────────────────────────────────────────
  'kill.registered':        ['saidas', 'dashboard'],

  // ── Weapon return confirmation ─────────────────────────────────────────
  'weapon.return_confirmed':['saidas', 'membros', 'dashboard'],
  'weapon.return_rejected': ['saidas', 'membros', 'dashboard'],
};

const DEBOUNCE_MS = 5_000;

// Estado local do subscriber
const _pending = new Set();
let _timer = null;
let _inFlight = false;

function scheduleFlush() {
  if (_timer) return;
  _timer = setTimeout(async () => {
    _timer = null;
    if (_inFlight) {
      // Houve sync a correr — reagenda; o novo estado apanha na próxima.
      scheduleFlush();
      return;
    }
    const tabs = [..._pending];
    _pending.clear();
    if (!tabs.length) return;
    _inFlight = true;
    const { syncOne } = require('./syncEngine');
    try {
      for (const tab of tabs) {
        try {
          const r = await syncOne(tab);
          if (r?.skipped) {
            log(`[PROJ] ${tab} skipped: ${r.skipped}`);
          } else {
            log(`[PROJ] ${tab} sync: ${r.ops} ops em ${r.ms}ms`);
          }
        } catch (e) {
          warn(`[PROJ] ${tab} falhou: ${e.message}`);
        }
      }
    } finally {
      _inFlight = false;
      // Se chegaram mais eventos entretanto, reagenda.
      if (_pending.size) scheduleFlush();
    }
  }, DEBOUNCE_MS);
}

function onDomainEvent(event) {
  return (_payload) => {
    const tabs = EVENT_TO_TABS[event];
    if (!tabs?.length) return;
    for (const tab of tabs) _pending.add(tab);
    scheduleFlush();
  };
}

function registerSheetProjections() {
  for (const event of Object.keys(EVENT_TO_TABS)) {
    eventBus.on(event, onDomainEvent(event));
  }
  log(`[PROJ] Subscritos ${Object.keys(EVENT_TO_TABS).length} eventos → sheets projections.`);
}

// Exposto para testes — permite forçar o flush imediato.
async function _flushNow() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const tabs = [..._pending];
  _pending.clear();
  if (!tabs.length) return [];
  const { syncOne } = require('./syncEngine');
  const results = [];
  for (const tab of tabs) {
    try { results.push(await syncOne(tab)); }
    catch (e) { results.push({ tab, error: e.message }); }
  }
  return results;
}

module.exports = {
  registerSheetProjections,
  EVENT_TO_TABS,
  DEBOUNCE_MS,
  _flushNow,
};
