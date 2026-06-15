'use strict';

const CONFIG = require('./index');

function addSnowflakeFinding(findings, key, value, required = true) {
  if (!value) {
    if (required) findings.push({ level: 'error', key, message: 'Em falta.' });
    return;
  }
  if (!/^\d{17,20}$/.test(String(value))) {
    findings.push({ level: 'error', key, message: `Formato inválido ("${value}") — esperado Discord snowflake.` });
  }
}

function validateConfig(config = CONFIG) {
  const findings = [];
  const err = (key, message) => findings.push({ level: 'error', key, message });
  const warn = (key, message) => findings.push({ level: 'warn', key, message });

  if (!config.DATABASE_URL) {
    err('DATABASE_URL', 'Em falta — obrigatório para sincronização DB ↔ Discord.');
  } else {
    try {
      new URL(config.DATABASE_URL);
    } catch {
      err('DATABASE_URL', 'Formato inválido — deve ser uma URI PostgreSQL válida.');
    }
  }

  addSnowflakeFinding(findings, 'DISCORD_GUILD_ID', config.DISCORD_GUILD_ID);

  for (const key of [
    'MANDA_CHUVA_ROLE_ID',
    'KINGPIN_ROLE_ID',
    'OG_ROLE_ID',
    'REAL_GANGSTER_ROLE_ID',
    'PATRAO_DI_ZONA_ROLE_ID',
    'YOUNG_BLOOD_ROLE_ID',
    'O_GUNAO_ROLE_ID',
    'GANGSTER_FODIDO_ROLE_ID',
    'BAIRRISTAS_BASE_ROLE_ID',
  ]) {
    addSnowflakeFinding(findings, key, config[key]);
  }

  if (!config.PENDENTE_ROLE_ID && config.AUTO_ASSIGN_PENDENTE) {
    warn('PENDENTE_ROLE_ID', 'AUTO_ASSIGN_PENDENTE=true mas role pendente em falta.');
  } else {
    addSnowflakeFinding(findings, 'PENDENTE_ROLE_ID', config.PENDENTE_ROLE_ID, false);
  }

  addSnowflakeFinding(findings, 'TAG_REQUEST_CHANNEL_ID', config.TAG_REQUEST_CHANNEL_ID);
  addSnowflakeFinding(findings, 'PANEL_ENTRADA_CHANNEL_ID', config.PANEL_ENTRADA_CHANNEL_ID);
  addSnowflakeFinding(findings, 'AUDIT_LOG_CHANNEL_ID', config.AUDIT_LOG_CHANNEL_ID, false);
  if (!config.AUDIT_LOG_CHANNEL_ID) warn('AUDIT_LOG_CHANNEL_ID', 'Sem canal de auditoria — logs ficam só na DB/runtime.');

  const memberCategory = config.MEMBER_CHANNELS_CATEGORY_ID || config.BAIRRISTA_TOPICOS_CATEGORY_ID;
  addSnowflakeFinding(findings, 'MEMBER_CHANNELS_CATEGORY_ID', memberCategory);

  if (config.BOT_LOGO_URL) {
    try {
      new URL(config.BOT_LOGO_URL);
    } catch {
      warn('BALLAS_GANG_LOGO_URL', 'URL de logo inválida — os embeds arrancam sem thumbnail.');
    }
  }

  return findings;
}

function formatReport(findings) {
  if (findings.length === 0) return '[CONFIG] ✅ Validação OK — zero issues.';
  const errors = findings.filter(f => f.level === 'error');
  const warnings = findings.filter(f => f.level === 'warn');
  const lines = [`[CONFIG] Relatório — ${errors.length} erro(s), ${warnings.length} aviso(s):`];
  for (const f of errors) lines.push(`  ❌ ${f.key}: ${f.message}`);
  for (const f of warnings) lines.push(`  ⚠️  ${f.key}: ${f.message}`);
  return lines.join('\n');
}

function validateOrExit(config) {
  const findings = validateConfig(config);
  const report = formatReport(findings);
  const hasErrors = findings.some(f => f.level === 'error');
  // eslint-disable-next-line no-console
  console[hasErrors ? 'error' : 'log'](report);
  if (hasErrors) {
    throw new Error(`[CONFIG] ${findings.filter(f => f.level === 'error').length} erro(s) de configuração — abortar arranque.`);
  }
  return findings;
}

module.exports = { validateConfig, formatReport, validateOrExit };
