'use strict';
const { guildId, optId, optList } = require('./_helpers');

module.exports = {
  // Categorias
  BAIRRISTA_TOPICOS_CATEGORY_ID: guildId('BAIRRISTA_TOPICOS_CATEGORY_ID', 'categories'),
  // Overflow: categorias extra para quando a principal atinge o limite Discord
  // de 50 canais. Comma-separated env var: BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS=id1,id2,id3
  BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS: optList('BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS'),
  BAIRRISTA_ARQUIVO_CATEGORY_ID: optId('BAIRRISTA_ARQUIVO_CATEGORY_ID'),
  // Canais operacionais
  TAG_REQUEST_CHANNEL_ID: guildId('TAG_REQUEST_CHANNEL_ID', 'channels'),
  AUDIT_LOG_CHANNEL_ID: optId('AUDIT_LOG_CHANNEL_ID'),
  PANEL_ENTRADA_CHANNEL_ID: guildId('PANEL_ENTRADA_CHANNEL_ID', 'channels'),
  WEEKLY_TOP_CHANNEL_ID: optId('WEEKLY_TOP_CHANNEL_ID'),
  // Resumo diário — default para canal de logs (staff-only, não user-facing).
  DAILY_SUMMARY_CHANNEL_ID: guildId('DAILY_SUMMARY_CHANNEL_ID', 'channels'),
  CEMETERY_CHANNEL_ID: optId('CEMETERY_CHANNEL_ID'),
  // Canal dedicado para resultados ricos de saídas; fallback para AUDIT_LOG.
  SAIDA_RESULTS_CHANNEL_ID: optId('SAIDA_RESULTS_CHANNEL_ID'),
  // Painel vivo de saídas; default igual ao canal de notificações.
  SAIDA_SESSION_CHANNEL_ID: guildId('SAIDA_SESSION_CHANNEL_ID', 'channels'),
  // Canal público onde o bot anuncia cooldowns de spot — toda a gente vê
  // que um spot está "queimado" e quanto tempo falta.
  SPOT_COOLDOWN_CHANNEL_ID: optId('SPOT_COOLDOWN_CHANNEL_ID', '1492736946072453190'),
  STRUCTURE_SYNC_LOG_CHANNEL_ID: optId('STRUCTURE_SYNC_LOG_CHANNEL_ID'),
  // Painéis
  PANEL_BAIRRISTAS_CHANNEL_ID: optId('PANEL_BAIRRISTAS_CHANNEL_ID'),
  PANEL_OFICIAIS_CHANNEL_ID: guildId('PANEL_OFICIAIS_CHANNEL_ID', 'channels'),
  PANEL_CHEFIA_CHANNEL_ID: optId('PANEL_CHEFIA_CHANNEL_ID'),
  PANEL_PATRAO_DI_ZONA_CHANNEL_ID: optId('PANEL_PATRAO_DI_ZONA_CHANNEL_ID'),
};
