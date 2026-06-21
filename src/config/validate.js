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

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function addPositiveNumberFinding(findings, key, value) {
  if (!isFiniteNumber(value) || Number(value) <= 0) {
    findings.push({ level: 'error', key, message: 'Deve ser > 0.' });
  }
}

function addHourFinding(findings, key, value) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    findings.push({ level: 'error', key, message: 'Deve estar entre 0 e 23.' });
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
  if (!config.AUDIT_LOG_CHANNEL_ID)
    warn('AUDIT_LOG_CHANNEL_ID', 'Sem canal de auditoria — logs ficam só na DB/runtime.');

  const memberCategory = config.MEMBER_CHANNELS_CATEGORY_ID || config.BAIRRISTA_TOPICOS_CATEGORY_ID;
  addSnowflakeFinding(findings, 'MEMBER_CHANNELS_CATEGORY_ID', memberCategory);

  if (config.GOOGLE_SERVICE_ACCOUNT_JSON && !config.SPREADSHEET_ID) {
    err('SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON definido mas SPREADSHEET_ID em falta.');
  }

  if (config.AVAILABILITY_AUTO_PUBLISH_ENABLED && !config.AVAILABILITY_CHANNEL_ID) {
    err('AVAILABILITY_CHANNEL_ID', 'AVAILABILITY_AUTO_PUBLISH_ENABLED=true mas canal em falta.');
  }

  if (config.PANELS_STICKY_MODE && !['repost', 'update', 'none'].includes(String(config.PANELS_STICKY_MODE))) {
    err('PANELS_STICKY_MODE', 'Modo invalido; usa repost, update ou none.');
  }

  if (config.RADIO_RANDOM_MIN !== undefined || config.RADIO_RANDOM_MAX !== undefined) {
    if (!isFiniteNumber(config.RADIO_RANDOM_MIN)) err('RADIO_RANDOM_MIN', 'Deve ser numerico.');
    if (!isFiniteNumber(config.RADIO_RANDOM_MAX)) err('RADIO_RANDOM_MAX', 'Deve ser numerico.');
    if (
      isFiniteNumber(config.RADIO_RANDOM_MIN) &&
      isFiniteNumber(config.RADIO_RANDOM_MAX) &&
      Number(config.RADIO_RANDOM_MAX) < Number(config.RADIO_RANDOM_MIN)
    ) {
      err('RADIO_RANDOM_MAX', 'Tem de ser >= RADIO_RANDOM_MIN.');
    }
  }

  if (config.WEEKLY_TOP_DAY !== undefined) {
    const day = Number(config.WEEKLY_TOP_DAY);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      err('WEEKLY_TOP_DAY', 'Deve estar entre 0 e 6.');
    }
  }
  if (config.WEEKLY_TOP_HOUR !== undefined) addHourFinding(findings, 'WEEKLY_TOP_HOUR', config.WEEKLY_TOP_HOUR);
  if (config.DAILY_SUMMARY_HOUR !== undefined)
    addHourFinding(findings, 'DAILY_SUMMARY_HOUR', config.DAILY_SUMMARY_HOUR);
  if (config.BAIRRISTA_WEEKLY_PRIZE_HOUR !== undefined) {
    addHourFinding(findings, 'BAIRRISTA_WEEKLY_PRIZE_HOUR', config.BAIRRISTA_WEEKLY_PRIZE_HOUR);
  }

  if (config.PROMO_YOUNG_BLOOD_TO_GUNAO !== undefined) {
    addPositiveNumberFinding(findings, 'PROMO_YOUNG_BLOOD_TO_GUNAO', config.PROMO_YOUNG_BLOOD_TO_GUNAO);
  }
  if (config.PROMO_GUNAO_TO_GANGSTER_FODIDO !== undefined) {
    addPositiveNumberFinding(findings, 'PROMO_GUNAO_TO_GANGSTER_FODIDO', config.PROMO_GUNAO_TO_GANGSTER_FODIDO);
  }

  if (config.SPOT_COOLDOWN_MINUTES !== undefined) {
    if (!isFiniteNumber(config.SPOT_COOLDOWN_MINUTES) || Number(config.SPOT_COOLDOWN_MINUTES) <= 0) {
      err('SPOT_COOLDOWN_MINUTES', 'Deve ser > 0.');
    } else if (Number(config.SPOT_COOLDOWN_MINUTES) > 1440) {
      warn('SPOT_COOLDOWN_MINUTES', 'Valor acima de 24h; confirma que e intencional.');
    }
  }
  addSnowflakeFinding(findings, 'SPOT_COOLDOWN_CHANNEL_ID', config.SPOT_COOLDOWN_CHANNEL_ID, false);
  if (config.SPOT_COOLDOWN_CHANNEL_ID === '') {
    warn('SPOT_COOLDOWN_CHANNEL_ID', 'Sem canal de notificacao de cooldown.');
  }

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
    throw new Error(
      `[CONFIG] ${findings.filter(f => f.level === 'error').length} erro(s) de configuração — abortar arranque.`
    );
  }
  return findings;
}

module.exports = { validateConfig, formatReport, validateOrExit };
