'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const v = require('../src/shared/inputValidators');

describe('inputValidators', () => {
  describe('sanitizeText', () => {
    it('remove mentions e backticks', () => {
      assert.equal(v.sanitizeText('hello <@123456789012345678> world'), 'hello world');
      assert.equal(v.sanitizeText('test <#987654321098765432> end'), 'test end');
      assert.equal(v.sanitizeText('code ```block``` injected'), 'code block injected');
    });
    it('collapse whitespace', () => {
      assert.equal(v.sanitizeText('a   b    c'), 'a b c');
    });
    it('trunca a maxLen', () => {
      const long = 'x'.repeat(600);
      const out = v.sanitizeText(long, 100);
      assert.ok(out.length <= 100);
      assert.ok(out.endsWith('…'));
    });
    it('aceita null/undefined', () => {
      assert.equal(v.sanitizeText(null), '');
      assert.equal(v.sanitizeText(undefined), '');
    });
  });

  describe('validateText', () => {
    it('required bloqueia vazio', () => {
      const r = v.validateText('', { required: true, name: 'nome' });
      assert.equal(r.ok, false);
      assert.match(r.error, /obrigatório/);
    });
    it('minLen', () => {
      const r = v.validateText('ab', { minLen: 3, name: 'nome' });
      assert.equal(r.ok, false);
    });
    it('ok devolve string sanitizada', () => {
      const r = v.validateText('hello <@123456789012345678>', { maxLen: 50 });
      assert.equal(r.ok, true);
      assert.equal(r.value, 'hello');
    });
  });

  describe('validateInt', () => {
    it('rejeita string não numérica', () => {
      const r = v.validateInt('abc');
      assert.equal(r.ok, false);
    });
    it('respeita min/max', () => {
      assert.equal(v.validateInt('5', { min: 10 }).ok, false);
      assert.equal(v.validateInt('50', { max: 10 }).ok, false);
      assert.equal(v.validateInt('5', { min: 0, max: 10 }).value, 5);
    });
    it('vazio não-required → 0', () => {
      assert.equal(v.validateInt('', {}).value, 0);
    });
  });

  describe('validateYesNo', () => {
    it('aceita múltiplas formas', () => {
      assert.equal(v.validateYesNo('s').value, true);
      assert.equal(v.validateYesNo('Sim').value, true);
      assert.equal(v.validateYesNo('n').value, false);
      assert.equal(v.validateYesNo('nao').value, false);
      assert.equal(v.validateYesNo('Não').value, false);
    });
    it('rejeita outros', () => {
      assert.equal(v.validateYesNo('maybe').ok, false);
    });
  });

  describe('validateDate', () => {
    it('aceita YYYY-MM-DD', () => {
      assert.equal(v.validateDate('2026-04-15').value, '2026-04-15');
    });
    it('rejeita outros formatos', () => {
      assert.equal(v.validateDate('15/04/2026').ok, false);
      assert.equal(v.validateDate('2026-13-01').ok, false);
    });
  });

  describe('validateTime', () => {
    it('aceita HH:MM e normaliza', () => {
      assert.equal(v.validateTime('9:30').value, '09:30');
      assert.equal(v.validateTime('23:59').value, '23:59');
    });
    it('rejeita fora de intervalo', () => {
      assert.equal(v.validateTime('25:00').ok, false);
      assert.equal(v.validateTime('12:60').ok, false);
    });
  });

  describe('validateEnum', () => {
    it('aceita valores válidos', () => {
      assert.equal(v.validateEnum('vitoria', ['vitoria', 'derrota']).value, 'vitoria');
    });
    it('rejeita outros', () => {
      assert.equal(v.validateEnum('outro', ['vitoria', 'derrota']).ok, false);
    });
  });

  describe('runAll', () => {
    it('agrega erros', () => {
      const r = v.runAll({
        nome: [v.validateText, '', { required: true, name: 'nome' }],
        qty: [v.validateInt, 'abc', { name: 'qty' }],
      });
      assert.equal(r.ok, false);
      assert.ok(r.errors.nome);
      assert.ok(r.errors.qty);
    });
    it('quando tudo válido devolve values', () => {
      const r = v.runAll({
        nome: [v.validateText, 'Steve', { required: true }],
        qty: [v.validateInt, '5', { min: 1, max: 10 }],
      });
      assert.equal(r.ok, true);
      assert.equal(r.values.nome, 'Steve');
      assert.equal(r.values.qty, 5);
    });
  });
});
