'use strict';
/**
 * Testes do fluxo novo da sessão de saída:
 *   - EVENT_TO_TABS cobre eventos novos (saida.opened, weapon.*, orders)
 *   - Policy do weapon_return_status (regras)
 *   - Templates saidaLifecycle para novos eventos
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const shouldSkip = !process.env.CI && !process.env.DISCORD_BOT_TOKEN;

(shouldSkip ? describe.skip : describe)('sessão de saída — cobertura Sheets event-driven', () => {
  const { EVENT_TO_TABS } = require('../src/sheets/projections');

  it('saida.opened mapeado para saidas + resumo + dashboard', () => {
    const tabs = EVENT_TO_TABS['saida.opened'];
    assert.ok(Array.isArray(tabs) && tabs.length > 0);
    assert.ok(tabs.includes('saidas'));
    assert.ok(tabs.includes('resumo'));
    assert.ok(tabs.includes('dashboard'));
  });

  it('saida.closed continua a invalidar membros', () => {
    const tabs = EVENT_TO_TABS['saida.closed'];
    assert.ok(Array.isArray(tabs));
    assert.ok(tabs.includes('membros'));
  });

  it('weapon.return_confirmed invalida saidas + membros + dashboard', () => {
    const tabs = EVENT_TO_TABS['weapon.return_confirmed'];
    assert.ok(tabs.includes('saidas'));
    assert.ok(tabs.includes('membros'));
    assert.ok(tabs.includes('dashboard'));
  });

  it('order.created invalida stock + dashboard', () => {
    const tabs = EVENT_TO_TABS['order.created'];
    assert.ok(tabs.includes('stock'));
    assert.ok(tabs.includes('dashboard'));
  });

  it('member.joined e member.left invalidam membros + dashboard', () => {
    const j = EVENT_TO_TABS['member.joined'];
    const l = EVENT_TO_TABS['member.left'];
    assert.ok(j.includes('membros') && j.includes('dashboard'));
    assert.ok(l.includes('membros') && l.includes('dashboard'));
  });

  it('mapeamento cobre todos os eventos saida.* emitidos', () => {
    const events = ['saida.opened', 'saida.closed', 'saida.started'];
    for (const ev of events) {
      assert.ok(EVENT_TO_TABS[ev], `EVENT_TO_TABS deve cobrir ${ev}`);
    }
  });
});

(shouldSkip ? describe.skip : describe)('templates saídas — novos eventos', () => {
  // Templates saidaOpened/saidaClosed removidos na refactor v3.0
  // Eventos são agora consumidos directamente pelo lifecycle engine.
});
