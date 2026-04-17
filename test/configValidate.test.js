'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, formatReport } = require('../src/config/validate');

function baseConfig(overrides = {}) {
  return {
    DATABASE_URL: 'postgres://localhost:5432/test',
    MANDA_CHUVA_ROLE_ID: '12345678901234567',
    KINGPIN_ROLE_ID: '12345678901234568',
    OG_ROLE_ID: '12345678901234569',
    REAL_GANGSTER_ROLE_ID: '12345678901234570',
    PATRAO_DI_ZONA_ROLE_ID: '12345678901234571',
    YOUNG_BLOOD_ROLE_ID: '12345678901234572',
    O_GUNAO_ROLE_ID: '12345678901234573',
    GANGSTER_FODIDO_ROLE_ID: '12345678901234574',
    BAIRRISTAS_BASE_ROLE_ID: '12345678901234575',
    PENDENTE_ROLE_ID: '12345678901234576',
    AUTO_ASSIGN_PENDENTE: false,
    TAG_REQUEST_CHANNEL_ID: '12345678901234577',
    PANEL_ENTRADA_CHANNEL_ID: '12345678901234578',
    AUDIT_LOG_CHANNEL_ID: '12345678901234579',
    BAIRRISTA_TOPICOS_CATEGORY_ID: '12345678901234580',
    PROMO_YOUNG_BLOOD_TO_GUNAO: 25000,
    PROMO_GUNAO_TO_GANGSTER_FODIDO: 50000,
    GOOGLE_SERVICE_ACCOUNT_JSON: '',
    SPREADSHEET_ID: '',
    AVAILABILITY_SLOTS: ['12:00', '14:00'],
    AVAILABILITY_AUTO_PUBLISH_ENABLED: false,
    AVAILABILITY_CHANNEL_ID: '',
    RADIO_RANDOM_MIN: 1000,
    RADIO_RANDOM_MAX: 9999,
    WEEKLY_TOP_DAY: 0,
    WEEKLY_TOP_HOUR: 23,
    DAILY_SUMMARY_HOUR: 20,
    PANELS_STICKY_MODE: 'repost',
    ...overrides,
  };
}

test('validateConfig — config válido devolve zero findings', () => {
  const findings = validateConfig(baseConfig());
  assert.equal(findings.length, 0);
});

test('validateConfig — DATABASE_URL em falta é erro', () => {
  const findings = validateConfig(baseConfig({ DATABASE_URL: '' }));
  const err = findings.find(f => f.key === 'DATABASE_URL');
  assert.ok(err);
  assert.equal(err.level, 'error');
});

test('validateConfig — role ID core em falta é erro', () => {
  const findings = validateConfig(baseConfig({ BAIRRISTAS_BASE_ROLE_ID: '' }));
  const err = findings.find(f => f.key === 'BAIRRISTAS_BASE_ROLE_ID');
  assert.ok(err);
  assert.equal(err.level, 'error');
});

test('validateConfig — role ID com formato inválido é erro', () => {
  const findings = validateConfig(baseConfig({ MANDA_CHUVA_ROLE_ID: 'not-a-snowflake' }));
  const err = findings.find(f => f.key === 'MANDA_CHUVA_ROLE_ID');
  assert.ok(err);
  assert.equal(err.level, 'error');
  assert.match(err.message, /snowflake/i);
});

test('validateConfig — PENDENTE em falta com AUTO_ASSIGN=true é warning', () => {
  const findings = validateConfig(baseConfig({ PENDENTE_ROLE_ID: '', AUTO_ASSIGN_PENDENTE: true }));
  const warn = findings.find(f => f.key === 'PENDENTE_ROLE_ID');
  assert.ok(warn);
  assert.equal(warn.level, 'warn');
});

test('validateConfig — canais críticos em falta são erros', () => {
  const findings = validateConfig(baseConfig({ TAG_REQUEST_CHANNEL_ID: '', PANEL_ENTRADA_CHANNEL_ID: '' }));
  assert.ok(findings.find(f => f.key === 'TAG_REQUEST_CHANNEL_ID' && f.level === 'error'));
  assert.ok(findings.find(f => f.key === 'PANEL_ENTRADA_CHANNEL_ID' && f.level === 'error'));
});

test('validateConfig — Sheets parcial é erro', () => {
  const findings = validateConfig(baseConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: 'x', SPREADSHEET_ID: '' }));
  const err = findings.find(f => f.key === 'SPREADSHEET_ID');
  assert.ok(err);
  assert.equal(err.level, 'error');
});

test('validateConfig — availability auto-publish sem canal é erro', () => {
  const findings = validateConfig(baseConfig({ AVAILABILITY_AUTO_PUBLISH_ENABLED: true, AVAILABILITY_CHANNEL_ID: '' }));
  const err = findings.find(f => f.key === 'AVAILABILITY_CHANNEL_ID');
  assert.ok(err);
  assert.equal(err.level, 'error');
});

test('validateConfig — sticky mode inválido é erro', () => {
  const findings = validateConfig(baseConfig({ PANELS_STICKY_MODE: 'bogus' }));
  const err = findings.find(f => f.key === 'PANELS_STICKY_MODE');
  assert.ok(err);
  assert.equal(err.level, 'error');
});

test('validateConfig — radio max < min é erro', () => {
  const findings = validateConfig(baseConfig({ RADIO_RANDOM_MIN: 5000, RADIO_RANDOM_MAX: 1000 }));
  const err = findings.find(f => f.key === 'RADIO_RANDOM_MAX');
  assert.ok(err);
});

test('validateConfig — weekly_top_day fora do range é erro', () => {
  const findings = validateConfig(baseConfig({ WEEKLY_TOP_DAY: 9 }));
  const err = findings.find(f => f.key === 'WEEKLY_TOP_DAY');
  assert.ok(err);
});

test('validateConfig — thresholds promo = 0 é erro', () => {
  const findings = validateConfig(baseConfig({ PROMO_YOUNG_BLOOD_TO_GUNAO: 0 }));
  assert.ok(findings.find(f => f.key === 'PROMO_YOUNG_BLOOD_TO_GUNAO' && f.level === 'error'));
});

test('formatReport — config ok reporta "OK"', () => {
  const report = formatReport([]);
  assert.match(report, /OK/i);
});

test('formatReport — inclui contagens de errors e warnings', () => {
  const report = formatReport([
    { level: 'error', key: 'X', message: 'fail' },
    { level: 'warn', key: 'Y', message: 'meh' },
  ]);
  assert.match(report, /1 erro/);
  assert.match(report, /1 aviso/);
});
