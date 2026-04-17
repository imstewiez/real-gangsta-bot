'use strict';
/**
 * Testes do fluxo novo da sessão de saída:
 *   - EVENT_TO_TABS cobre eventos novos (saida.opened, weapon.*, orders)
 *   - Policy do weapon_return_status (regras)
 *   - Templates saidaLifecycle para novos eventos
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('sessão de saída — cobertura Sheets event-driven', () => {
  const { EVENT_TO_TABS } = require('../src/sheets/projections');

  it('saida.opened mapeado para saidas + resumo + dashboard', () => {
    const tabs = EVENT_TO_TABS['saida.opened'];
    assert.ok(Array.isArray(tabs) && tabs.length > 0);
    assert.ok(tabs.includes('saidas'));
    assert.ok(tabs.includes('resumo'));
    assert.ok(tabs.includes('dashboard'));
  });

  it('saida.closed continua a invalidar membros', () => {
    assert.ok(EVENT_TO_TABS['saida.closed'].includes('membros'));
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
    assert.ok(EVENT_TO_TABS['member.joined'].includes('membros'));
    assert.ok(EVENT_TO_TABS['member.left'].includes('membros'));
    assert.ok(EVENT_TO_TABS['member.left'].includes('dashboard'));
  });

  it('mapeamento cobre todos os eventos saida.* emitidos', () => {
    const required = [
      'saida.opened',
      'saida.started',
      'saida.closed',
      'saida.participant_added',
      'saida.material_issued',
    ];
    for (const e of required) {
      assert.ok(Array.isArray(EVENT_TO_TABS[e]) && EVENT_TO_TABS[e].length, `evento ${e} deve estar mapeado`);
    }
  });
});

describe('templates saídas — novos eventos', () => {
  const { saidaLifecycleEmbed } = require('../src/notifications/templates');

  it('event=weapon_return produz embed com título certo', () => {
    const embed = saidaLifecycleEmbed({
      event: 'weapon_return',
      saidaId: 42,
      notes: 'Decisão: confirmada para membro #7',
    });
    const json = embed.toJSON();
    assert.match(json.title || '', /Saída #42/);
    assert.match(json.title || '', /Devolução/);
  });

  it('event=opened inclui spot e saidaType em fields', () => {
    const embed = saidaLifecycleEmbed({
      event: 'opened',
      saidaId: 99,
      spot: 'Warehouse',
      saidaType: 'craft',
      leaderId: '12345',
    });
    const json = embed.toJSON();
    const fieldNames = (json.fields || []).map(f => f.name);
    assert.ok(fieldNames.includes('Spot'));
    assert.ok(fieldNames.includes('Tipo'));
    assert.ok(fieldNames.includes('Líder'));
  });

  it('event=closed inclui stats económicos', () => {
    const embed = saidaLifecycleEmbed({
      event: 'closed',
      saidaId: 100,
      gross: 1000,
      net: 800,
      lost: 100,
      consumed: 100,
      unaccounted: 0,
    });
    const json = embed.toJSON();
    const fieldNames = (json.fields || []).map(f => f.name);
    assert.ok(fieldNames.includes('Bruto'));
    assert.ok(fieldNames.includes('Líquido'));
  });

  it('unaccounted > 0 gera field de warning', () => {
    const embed = saidaLifecycleEmbed({
      event: 'closed',
      saidaId: 101,
      gross: 1000,
      net: 800,
      unaccounted: 50,
    });
    const json = embed.toJSON();
    const hasUnacc = (json.fields || []).some(f => /contabilizado/i.test(f.name));
    assert.ok(hasUnacc, 'deve mostrar field de material não contabilizado');
  });
});

describe('content — BUTTONS.CHEFIA limpo', () => {
  const { BUTTONS } = require('../src/content');

  it('só tem 9 entradas top-level', () => {
    const keys = Object.keys(BUTTONS.CHEFIA);
    assert.equal(keys.length, 9);
  });

  it('não tem PARTICIPANTES nem MATERIAL_SAIDA nem FORNECER', () => {
    assert.equal(BUTTONS.CHEFIA.PARTICIPANTES, undefined);
    assert.equal(BUTTONS.CHEFIA.MATERIAL_SAIDA, undefined);
    assert.equal(BUTTONS.CHEFIA.FORNECER, undefined);
    assert.equal(BUTTONS.CHEFIA.DISPONIBILIDADE, undefined);
    assert.equal(BUTTONS.CHEFIA.FECHAR_SAIDA, undefined);
    assert.equal(BUTTONS.CHEFIA.STATS, undefined);
  });

  it('ainda tem CRIAR_SAIDA, VER_SAIDAS, TOPS, LOGS', () => {
    assert.ok(BUTTONS.CHEFIA.CRIAR_SAIDA);
    assert.ok(BUTTONS.CHEFIA.VER_SAIDAS);
    assert.ok(BUTTONS.CHEFIA.TOPS);
    assert.ok(BUTTONS.CHEFIA.LOGS);
  });
});
