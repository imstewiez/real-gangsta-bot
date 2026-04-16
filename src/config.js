'use strict';
const path = require('path');

const envPath = process.env.ENV_FILE
  ? path.resolve(process.cwd(), process.env.ENV_FILE)
  : path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[CONFIG] Variável obrigatória em falta: ${name}`);
  return v;
}

function optId(name, fallback = '') {
  return process.env[name] || fallback;
}

function optBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true';
}

const CONFIG = {
  // ── Discord ───────────────────────────────────────────────────────────────
  DISCORD_BOT_TOKEN: req('DISCORD_BOT_TOKEN'),
  DISCORD_GUILD_ID: req('DISCORD_GUILD_ID'),

  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: process.env.DATABASE_URL || '',

  // ── Role IDs — Hierarquia completa ────────────────────────────────────────
  // Comando Total
  MANDA_CHUVA_ROLE_ID: optId('MANDA_CHUVA_ROLE_ID', '1490397675525242930'),
  KINGPIN_ROLE_ID: optId('KINGPIN_ROLE_ID', '1490397676204855308'),
  // Supervisão (oficiais seniores)
  OG_ROLE_ID: optId('OG_ROLE_ID', '1490397683070930945'),
  REAL_GANGSTER_ROLE_ID: optId('REAL_GANGSTER_ROLE_ID', '1491223266487173311'),
  // Patrão di Zona — chefe do bairro dos Bairristas
  PATRAO_DI_ZONA_ROLE_ID: optId('PATRAO_DI_ZONA_ROLE_ID', '1490397679753101312'),
  // Bairristas — tier ordering (entry → topo):
  //   young_blood (tier 1, entrada) → o_gunao (tier 2, após 25k€) → gangster_fodido (tier 3, após 50k€).
  //   Promoções excepcionais acima de Gangster Fodido são manuais.
  YOUNG_BLOOD_ROLE_ID: optId('YOUNG_BLOOD_ROLE_ID', '1491213753235275806'),
  O_GUNAO_ROLE_ID: optId('O_GUNAO_ROLE_ID', '1491213423613317220'),
  GANGSTER_FODIDO_ROLE_ID: optId('GANGSTER_FODIDO_ROLE_ID', '1491213170961022997'),
  // Role base obrigatória para qualquer bairrista (invariante).
  BAIRRISTAS_BASE_ROLE_ID: optId('BAIRRISTAS_BASE_ROLE_ID', '1490397684597653634'),
  // Pendente — atribuído automaticamente a quem acaba de chegar ao servidor.
  // Único role que vê boas-vindas. Removido quando o pedido de tag é aprovado.
  PENDENTE_ROLE_ID: optId('PENDENTE_ROLE_ID'),
  // Roles flavor (não-core)
  TROPINHAS_DO_GUETTO_ROLE_ID: optId('TROPINHAS_DO_GUETTO_ROLE_ID', '1490397688800477215'),
  PATRULHA_PATA_ROLE_ID: optId('PATRULHA_PATA_ROLE_ID', '1490795383448928276'),
  // Bot / configurador
  BOT_ROLE_ID: optId('BOT_ROLE_ID', '1493165105242832919'),
  CONFIGURADOR_ROLE_ID: optId('CONFIGURADOR_ROLE_ID', '1490397674543906938'),

  // ── Aliases semânticos ────────────────────────────────────────────────────
  get COMMAND_ROLE_IDS() {
    return [this.MANDA_CHUVA_ROLE_ID, this.KINGPIN_ROLE_ID].filter(Boolean);
  },
  get SUPERVISOR_ROLE_IDS() {
    return [this.OG_ROLE_ID, this.REAL_GANGSTER_ROLE_ID].filter(Boolean);
  },
  get CHEFIA_ROLE_IDS() {
    // "Chefia" = Comando total apenas (Manda-Chuva, Kingpin)
    return this.COMMAND_ROLE_IDS;
  },
  get OFICIAL_ROLE_IDS() {
    // Oficiais = Supervisão (OG, Real Gangster)
    return this.SUPERVISOR_ROLE_IDS;
  },
  /** IDs da role "Patrão di Zona" (gestão do ramo dos bairristas). */
  get PATRAO_DI_ZONA_ROLE_IDS() {
    return [this.PATRAO_DI_ZONA_ROLE_ID].filter(Boolean);
  },

  /** Tiers de bairrista (ordem: entry → topo). */
  get BAIRRISTA_TIER_ROLE_IDS() {
    return [this.YOUNG_BLOOD_ROLE_ID, this.O_GUNAO_ROLE_ID, this.GANGSTER_FODIDO_ROLE_ID].filter(Boolean);
  },

  /** Tier por defeito para entrada no BAIRRO (set pela onboardingEngine). */
  BAIRRISTA_DEFAULT_TIER: process.env.BAIRRISTA_DEFAULT_TIER || 'young_blood',

  // ── Promoção automática por material (unidades entregues) ──────────────────
  // Young Blood → O Gunão aos 25.000 itens
  // O Gunão → Gangster Fodido aos 50.000 itens
  PROMO_YOUNG_BLOOD_TO_GUNAO: Number(process.env.PROMO_YOUNG_BLOOD_TO_GUNAO || 25000),
  PROMO_GUNAO_TO_GANGSTER_FODIDO: Number(process.env.PROMO_GUNAO_TO_GANGSTER_FODIDO || 50000),

  // ── Category IDs ──────────────────────────────────────────────────────────
  BAIRRISTA_TOPICOS_CATEGORY_ID: optId('BAIRRISTA_TOPICOS_CATEGORY_ID', '1491543491233448006'),
  BAIRRISTA_ARQUIVO_CATEGORY_ID: optId('BAIRRISTA_ARQUIVO_CATEGORY_ID'),

  // ── Channel IDs ───────────────────────────────────────────────────────────
  TAG_REQUEST_CHANNEL_ID: optId('TAG_REQUEST_CHANNEL_ID', '1490397785948688529'),
  AUDIT_LOG_CHANNEL_ID: optId('AUDIT_LOG_CHANNEL_ID'),
  PANEL_ENTRADA_CHANNEL_ID: optId('PANEL_ENTRADA_CHANNEL_ID', '1494323241207201793'),
  WEEKLY_TOP_CHANNEL_ID: optId('WEEKLY_TOP_CHANNEL_ID'),
  DAILY_SUMMARY_CHANNEL_ID: optId('DAILY_SUMMARY_CHANNEL_ID'),
  CEMETERY_CHANNEL_ID: optId('CEMETERY_CHANNEL_ID'),
  // Canal dedicado para resultados ricos de saídas (3 embeds no fecho).
  // Se vazio, faz fallback para AUDIT_LOG_CHANNEL_ID.
  SAIDA_RESULTS_CHANNEL_ID: optId('SAIDA_RESULTS_CHANNEL_ID'),
  STRUCTURE_SYNC_LOG_CHANNEL_ID: optId('STRUCTURE_SYNC_LOG_CHANNEL_ID'),
  PANEL_BAIRRISTAS_CHANNEL_ID: optId('PANEL_BAIRRISTAS_CHANNEL_ID'),
  PANEL_OFICIAIS_CHANNEL_ID: optId('PANEL_OFICIAIS_CHANNEL_ID'),
  PANEL_CHEFIA_CHANNEL_ID: optId('PANEL_CHEFIA_CHANNEL_ID'),
  PANEL_PATRAO_DI_ZONA_CHANNEL_ID: optId('PANEL_PATRAO_DI_ZONA_CHANNEL_ID'),

  // ── Comportamento ─────────────────────────────────────────────────────────
  ARCHIVE_ON_PROMOTION: optBool('ARCHIVE_ON_PROMOTION', true),
  DELETE_ON_PROMOTION: optBool('DELETE_ON_PROMOTION', false),
  // Quando bairrista sai do servidor: arquivar ou apagar canal individual.
  // Default: apagar (DELETE_ON_LEAVE=true) — servidor fica limpo.
  DELETE_ON_LEAVE: optBool('DELETE_ON_LEAVE', true),
  ARCHIVE_ON_LEAVE: optBool('ARCHIVE_ON_LEAVE', false),
  // Auto-atribuir Pendente a newcomers (requer PENDENTE_ROLE_ID configurado).
  AUTO_ASSIGN_PENDENTE: optBool('AUTO_ASSIGN_PENDENTE', true),
  ENABLE_BACKGROUND_JOBS: optBool('ENABLE_BACKGROUND_JOBS', false),
  ENFORCE_ROLE_INVARIANTS: optBool('ENFORCE_ROLE_INVARIANTS', true),
  PANEL_BOOTSTRAP_ON_READY: optBool('PANEL_BOOTSTRAP_ON_READY', true),
  AUTO_PUBLISH_WEEKLY_TOP: optBool('AUTO_PUBLISH_WEEKLY_TOP', true),
  WEEKLY_TOP_DAY: Number(process.env.WEEKLY_TOP_DAY ?? 0), // 0=Dom..6=Sáb
  WEEKLY_TOP_HOUR: Number(process.env.WEEKLY_TOP_HOUR ?? 23),
  DAILY_SUMMARY_HOUR: Number(process.env.DAILY_SUMMARY_HOUR ?? 20),

  // Guard-rail: quando true, /rg-sync-structure fica travado em apply.
  // Use true em servidores onde a estrutura está personalizada manualmente
  // e não queres que o bot mexa. Ainda permite dry-run para inspeccionar.
  STRUCTURE_SYNC_LOCKED: optBool('STRUCTURE_SYNC_LOCKED', false),

  // ── Painéis sticky ────────────────────────────────────────────────────────
  // Mantém os painéis sempre visíveis no fundo do canal — o bot republica-os
  // após N mensagens novas. Valores: 'repost' (default), 'update' (edita sempre
  // a mesma mensagem, sem follow-the-scroll), 'none' (desligado).
  PANELS_STICKY_MODE: (process.env.PANELS_STICKY_MODE || 'repost').toLowerCase(),
  PANELS_STICKY_THRESHOLD_MSGS: Number(process.env.PANELS_STICKY_THRESHOLD_MSGS || 5),

  // ── Stock notifier ────────────────────────────────────────────────────────
  // Publica embeds dos movimentos de inventário em canais dedicados da
  // categoria indicada por STOCK_CHANNELS_CATEGORY_KEY (default: COMANDO —
  // só staff vê, mantém o canal OPERAÇÕES limpo para chefia).
  // Chaves válidas: qualquer key de structureTemplate.CATEGORIES (ex.:
  // COMANDO, INVENTARIO, OFICIAIS).
  // Auto-cria canais em falta e move canais existentes para a categoria
  // certa se os encontrar noutro sítio com o mesmo nome.
  STOCK_NOTIFY_ENABLED: optBool('STOCK_NOTIFY_ENABLED', true),
  STOCK_AUTOCREATE: optBool('STOCK_AUTOCREATE', true),
  STOCK_CHANNELS_CATEGORY_KEY: process.env.STOCK_CHANNELS_CATEGORY_KEY || 'COMANDO',
  STOCK_SUMMARY_INTERVAL_HOURS: Number(process.env.STOCK_SUMMARY_INTERVAL_HOURS || 4),

  // ── Rádio ─────────────────────────────────────────────────────────────────
  // Canal onde o painel de rádio é publicado/actualizado.
  RADIO_PUBLISH_CHANNEL_ID: optId('RADIO_PUBLISH_CHANNEL_ID'),
  // Range para geração aleatória (default: 1000-9999, números curtos sem zero).
  RADIO_RANDOM_MIN: Number(process.env.RADIO_RANDOM_MIN || 1000),
  RADIO_RANDOM_MAX: Number(process.env.RADIO_RANDOM_MAX || 9999),
  // Permite explicitamente 0/0000 como rádio válida (default: não).
  RADIO_ALLOW_ZERO: optBool('RADIO_ALLOW_ZERO', false),

  // ── Disponibilidade diária ────────────────────────────────────────────────
  // Canal onde a mensagem de "chamada para a rua" é publicada todos os dias.
  AVAILABILITY_CHANNEL_ID: optId('AVAILABILITY_CHANNEL_ID'),
  // Slots default — 12:00 → 02:00 com saltos de 2h. Máximo 8 (limite do select
  // Discord = 25 opções e usamos 3 estados por slot).
  AVAILABILITY_SLOTS: (process.env.AVAILABILITY_SLOTS ||
    '12:00,14:00,16:00,18:00,20:00,22:00,00:00,02:00')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 8),
  // Roles a mencionar ao publicar (separadas por vírgula). Se vazio, o engine
  // faz fallback para [BAIRRISTAS_BASE_ROLE_ID] automaticamente — todos os
  // bairristas são alertados.
  AVAILABILITY_MENTION_ROLE_IDS: (process.env.AVAILABILITY_MENTION_ROLE_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean),
  // Job auto-publish — default ligado, dispara à meia-noite local do servidor.
  // O job corre de 5 em 5 min e age só na hora indicada (idempotente via uq
  // index). Se o bot reiniciar entre 00:00-00:59 publica na mesma.
  AVAILABILITY_AUTO_PUBLISH_ENABLED: optBool('AVAILABILITY_AUTO_PUBLISH_ENABLED', true),
  AVAILABILITY_AUTO_PUBLISH_HOUR: Number(process.env.AVAILABILITY_AUTO_PUBLISH_HOUR || 0),

  // ── Branding ──────────────────────────────────────────────────────────────
  // BOT_INTERNAL_NAME  — nome técnico, aparece em logs/metrics/health/version.
  //                      Default: "Bot di Zona".
  // BOT_DISPLAY_NAME   — assinatura in-character que aparece em embeds e
  //                      mensagens ao user. Default: "Firma RedWood".
  // Podes override qualquer um via Railway.
  BOT_INTERNAL_NAME: process.env.BOT_INTERNAL_NAME || 'Bot di Zona',
  BOT_DISPLAY_NAME: process.env.BOT_DISPLAY_NAME || 'Firma RedWood',
  BOT_LOGO_URL: process.env.BOT_LOGO_URL || '',
  BOT_COLOR: parseInt(process.env.BOT_COLOR || 'E74C3C', 16),

  // ── Logging ───────────────────────────────────────────────────────────────
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  DEBUG_LOG_DIR: process.env.DEBUG_LOG_DIR || './logs',
  DEBUG_LOG_FILE: process.env.DEBUG_LOG_FILE || 'realgangsta-debug.log',

  // ── Google Sheets (opcional) ──────────────────────────────────────────────
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '',

  // ── Paths ─────────────────────────────────────────────────────────────────
  STATE_FILE: process.env.STATE_FILE || './state.json',
};

// Resolve paths
CONFIG.DEBUG_LOG_DIR = path.resolve(process.cwd(), CONFIG.DEBUG_LOG_DIR);

// Helper — Sheets está activo apenas se tudo está configurado
CONFIG.isSheetsEnabled = function () {
  return Boolean(this.GOOGLE_SERVICE_ACCOUNT_JSON && this.SPREADSHEET_ID);
};

module.exports = CONFIG;
