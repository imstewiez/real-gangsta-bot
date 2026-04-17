'use strict';
/**
 * validateConfig — checks fortes ao arranque, relatório claro.
 *
 * Chamado por bootstrap.js ANTES do login. Agrupa warnings e erros num
 * único relatório. Erros abortam o boot; warnings ficam nos logs.
 *
 * Regras:
 *   - DISCORD_BOT_TOKEN + DISCORD_GUILD_ID obrigatórios (já validados por req())
 *   - DATABASE_URL obrigatório em produção
 *   - Role IDs da hierarquia core: todos devem estar presentes senão permissões partem
 *   - BAIRRISTAS_BASE_ROLE_ID obrigatório (invariante do onboarding)
 *   - Canais-chave: TAG_REQUEST, PANEL_ENTRADA obrigatórios (fluxo de entrada)
 *   - Sheets: se qualquer (creds | spreadsheet_id) está definido, o outro também tem de estar
 *   - Slots de availability: tem de ter pelo menos 1
 *   - Thresholds numéricos: têm de ser > 0
 *
 * Tudo em formato uniforme: `{level, key, message}`.
 */

const CONFIG = require('./index');

function validateConfig(config = CONFIG) {
  const findings = [];
  const err = (key, message) => findings.push({ level: 'error', key, message });
  const warn = (key, message) => findings.push({ level: 'warn', key, message });

  // ── Database ──
  if (!config.DATABASE_URL) {
    err('DATABASE_URL', 'Em falta — obrigatório em produção (Railway). Sem DB não arranca.');
  }

  // ── Role IDs core ──
  const coreRoles = [
    'MANDA_CHUVA_ROLE_ID',
    'KINGPIN_ROLE_ID',
    'OG_ROLE_ID',
    'REAL_GANGSTER_ROLE_ID',
    'PATRAO_DI_ZONA_ROLE_ID',
    'YOUNG_BLOOD_ROLE_ID',
    'O_GUNAO_ROLE_ID',
    'GANGSTER_FODIDO_ROLE_ID',
    'BAIRRISTAS_BASE_ROLE_ID',
  ];
  for (const k of coreRoles) {
    if (!config[k]) err(k, 'Role ID core em falta — permissões vão partir.');
    else if (!/^\d{17,20}$/.test(String(config[k]))) {
      err(k, `Formato inválido ("${config[k]}") — esperado Discord snowflake (17-20 dígitos).`);
    }
  }

  // BAIRRISTAS_BASE_ROLE_ID é invariante — já está nos coreRoles, mas reitera.
  if (!config.BAIRRISTAS_BASE_ROLE_ID) {
    err(
      'BAIRRISTAS_BASE_ROLE_ID',
      'Role base obrigatória — onboarding não consegue atribuir invariante "todo bairrista tem base".'
    );
  }

  // PENDENTE — só aviso, flow sobrevive sem.
  if (!config.PENDENTE_ROLE_ID && config.AUTO_ASSIGN_PENDENTE) {
    warn('PENDENTE_ROLE_ID', 'AUTO_ASSIGN_PENDENTE=true mas role em falta — newcomers não vão ser marcados.');
  }

  // ── Canais-chave ──
  if (!config.TAG_REQUEST_CHANNEL_ID) {
    err('TAG_REQUEST_CHANNEL_ID', 'Canal de pedidos de tag em falta — chefia não recebe aprovações.');
  }
  if (!config.PANEL_ENTRADA_CHANNEL_ID) {
    err('PANEL_ENTRADA_CHANNEL_ID', 'Canal de entrada em falta — ninguém consegue começar onboarding.');
  }
  if (!config.AUDIT_LOG_CHANNEL_ID) {
    warn('AUDIT_LOG_CHANNEL_ID', 'Sem canal de audit — logs ficam apenas na DB.');
  }

  // ── Categorias ──
  if (!config.BAIRRISTA_TOPICOS_CATEGORY_ID) {
    err(
      'BAIRRISTA_TOPICOS_CATEGORY_ID',
      'Categoria do bairro em falta — canais individuais de bairristas não têm onde ser criados.'
    );
  }

  // ── Promoção ──
  if (config.PROMO_YOUNG_BLOOD_TO_GUNAO <= 0) {
    err('PROMO_YOUNG_BLOOD_TO_GUNAO', 'Threshold tem de ser > 0.');
  }
  if (config.PROMO_GUNAO_TO_GANGSTER_FODIDO <= 0) {
    err('PROMO_GUNAO_TO_GANGSTER_FODIDO', 'Threshold tem de ser > 0.');
  }
  if (config.PROMO_GUNAO_TO_GANGSTER_FODIDO <= config.PROMO_YOUNG_BLOOD_TO_GUNAO) {
    warn(
      'PROMO_GUNAO_TO_GANGSTER_FODIDO',
      `Valor (${config.PROMO_GUNAO_TO_GANGSTER_FODIDO}) deve ser maior que PROMO_YOUNG_BLOOD_TO_GUNAO (${config.PROMO_YOUNG_BLOOD_TO_GUNAO}).`
    );
  }

  // ── Sheets ──
  const sheetsCredsSet = Boolean(config.GOOGLE_SERVICE_ACCOUNT_JSON);
  const sheetsIdSet = Boolean(config.SPREADSHEET_ID);
  if (sheetsCredsSet !== sheetsIdSet) {
    err(
      sheetsCredsSet ? 'SPREADSHEET_ID' : 'GOOGLE_SERVICE_ACCOUNT_JSON',
      'Configuração Sheets parcial — precisas de ambos (creds + spreadsheet id) ou nenhum.'
    );
  }

  // ── Availability ──
  if (!Array.isArray(config.AVAILABILITY_SLOTS) || config.AVAILABILITY_SLOTS.length === 0) {
    err('AVAILABILITY_SLOTS', 'Precisa de pelo menos 1 slot.');
  }
  if (config.AVAILABILITY_AUTO_PUBLISH_ENABLED && !config.AVAILABILITY_CHANNEL_ID) {
    err('AVAILABILITY_CHANNEL_ID', 'AUTO_PUBLISH_ENABLED=true mas canal em falta — job vai falhar.');
  }

  // ── Radio ──
  if (config.RADIO_RANDOM_MIN < 0 || config.RADIO_RANDOM_MAX < 0) {
    err('RADIO_RANDOM_MIN/MAX', 'Valores têm de ser >= 0.');
  }
  if (config.RADIO_RANDOM_MAX < config.RADIO_RANDOM_MIN) {
    err('RADIO_RANDOM_MAX', `MAX (${config.RADIO_RANDOM_MAX}) < MIN (${config.RADIO_RANDOM_MIN}).`);
  }

  // ── Jobs ──
  if (config.WEEKLY_TOP_DAY < 0 || config.WEEKLY_TOP_DAY > 6) {
    err('WEEKLY_TOP_DAY', `Valor (${config.WEEKLY_TOP_DAY}) fora do intervalo 0-6.`);
  }
  if (config.WEEKLY_TOP_HOUR < 0 || config.WEEKLY_TOP_HOUR > 23) {
    err('WEEKLY_TOP_HOUR', `Valor (${config.WEEKLY_TOP_HOUR}) fora do intervalo 0-23.`);
  }
  if (config.DAILY_SUMMARY_HOUR < 0 || config.DAILY_SUMMARY_HOUR > 23) {
    err('DAILY_SUMMARY_HOUR', `Valor (${config.DAILY_SUMMARY_HOUR}) fora do intervalo 0-23.`);
  }

  // ── Sticky ──
  const validStickyModes = new Set(['repost', 'update', 'none']);
  if (!validStickyModes.has(config.PANELS_STICKY_MODE)) {
    err('PANELS_STICKY_MODE', `Valor "${config.PANELS_STICKY_MODE}" inválido. Válidos: repost, update, none.`);
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

/**
 * Valida e aborta o processo se houver erros.
 * Avisos são impressos como warn mas não bloqueiam.
 */
function validateOrExit(config) {
  const findings = validateConfig(config);
  const report = formatReport(findings);
  const hasErrors = findings.some(f => f.level === 'error');
  // Imprime sempre o relatório (mesmo OK) — ajuda a diagnosticar no Railway.
  // eslint-disable-next-line no-console
  console[hasErrors ? 'error' : 'log'](report);
  if (hasErrors) {
    throw new Error(
      `[CONFIG] ${findings.filter(f => f.level === 'error').length} erros de configuração — abortar arranque.`
    );
  }
  return findings;
}

module.exports = { validateConfig, formatReport, validateOrExit };
