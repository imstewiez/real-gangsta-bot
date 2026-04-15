'use strict';
const { SlashCommandBuilder } = require('discord.js');

// ══════════════════════════════════════════════════════════════════════════════
// Slash commands — conjunto mínimo essencial.
//
// Tudo o que tem equivalente em painel (radio, availability criar/fechar,
// operações criar, stock summary, etc.) fica como botão — menos comandos,
// menos ruído no autocomplete. Os comandos abaixo são os que cobrem:
//   1. consultas rápidas (stock, member, top, items, audit, version)
//   2. acções pontuais que fogem ao fluxo de painel (add-item, close-op, kill)
//   3. administração rara (sync-panels, sync-perms, sticky-*)
// ══════════════════════════════════════════════════════════════════════════════

const commands = [
  // ── Consultas rápidas ───────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-version')
    .setDescription('Identidade da instância actual do bot (commit, host, uptime)'),

  new SlashCommandBuilder()
    .setName('rg-stock')
    .setDescription('Stock atual de materiais'),

  new SlashCommandBuilder()
    .setName('rg-items')
    .setDescription('Catálogo de itens/materiais'),

  new SlashCommandBuilder()
    .setName('rg-member')
    .setDescription('Ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-top-week')
    .setDescription('Top semanal')
    .addStringOption(opt => opt.setName('semana').setDescription('atual/anterior').setRequired(false)
      .addChoices({ name: 'Semana Atual', value: 'current' }, { name: 'Semana Anterior', value: 'previous' })),

  new SlashCommandBuilder()
    .setName('rg-top-month')
    .setDescription('Top mensal')
    .addStringOption(opt => opt.setName('mes').setDescription('atual/anterior').setRequired(false)
      .addChoices({ name: 'Mês Atual', value: 'current' }, { name: 'Mês Anterior', value: 'previous' })),

  new SlashCommandBuilder()
    .setName('rg-top-alltime')
    .setDescription('Top all-time da firma')
    .addStringOption(opt => opt.setName('eixo').setDescription('Métrica para ordenar').setRequired(false)
      .addChoices(
        { name: 'Hybrid Score', value: 'hybrid_score' },
        { name: 'Kills',         value: 'kills_total' },
        { name: 'Material',      value: 'weighted_value' },
        { name: 'Lucro Gerado',  value: 'profit_generated' },
        { name: 'MVPs',          value: 'mvp_count' },
        { name: 'Saídas',        value: 'saidas_total' },
      )),

  new SlashCommandBuilder()
    .setName('rg-rebuild-rankings')
    .setDescription('Recalcula rankings mensais + all-time (chefia only)'),

  new SlashCommandBuilder()
    .setName('rg-audit')
    .setDescription('Logs de auditoria recentes')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Número de registos (default 20)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-cemetery')
    .setDescription('Leaderboard do cemitério'),

  // ── Acções pontuais que não têm painel ──────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-add-item')
    .setDescription('Adiciona um item ao catálogo')
    .addStringOption(opt => opt.setName('nome').setDescription('Nome do item').setRequired(true))
    .addStringOption(opt => opt.setName('categoria').setDescription('Categoria').setRequired(true))
    .addStringOption(opt => opt.setName('unidade').setDescription('Unidade de medida').setRequired(false))
    .addNumberOption(opt => opt.setName('valor').setDescription('Valor estimado').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-item-set-price')
    .setDescription('Altera o preço estimado de um item do catálogo')
    .addStringOption(opt => opt.setName('nome').setDescription('Nome exacto do item').setRequired(true))
    .addNumberOption(opt => opt.setName('preco').setDescription('Novo preço (€)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-items-sem-preco')
    .setDescription('Lista itens do catálogo sem preço definido'),

  new SlashCommandBuilder()
    .setName('rg-catalog-sync-prices')
    .setDescription('Carrega preços do precário oficial (config/prices-catalog.json)')
    .addStringOption(opt => opt.setName('modo').setDescription('só preços (default) ou full (+ categoria/unidade)').setRequired(false)
      .addChoices({ name: 'Preços', value: 'prices' }, { name: 'Full (+cat/unidade)', value: 'full' })),

  new SlashCommandBuilder()
    .setName('rg-close-saida')
    .setDescription('Fecha uma saída pelo ID (fallback ao painel)')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID da saída').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-kill')
    .setDescription('Regista uma kill no cemitério'),

  // ── Administração (raro) ────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-sync-panels')
    .setDescription('Republica/actualiza os painéis do bot nos canais dedicados'),

  new SlashCommandBuilder()
    .setName('rg-sync-perms')
    .setDescription('Aplica apenas permissões (não renomeia nem move canais — layout congelado)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-layout-check')
    .setDescription('Compara layout actual do Discord contra o lock file (nunca altera)'),

  // ── Google Sheets sync ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-sync-sheets')
    .setDescription('Sincroniza todas as tabs do Google Sheet com a DB'),

  new SlashCommandBuilder()
    .setName('rg-sync-sheets-tab')
    .setDescription('Sincroniza apenas uma tab do Google Sheet')
    .addStringOption(opt => opt.setName('tab').setDescription('Qual tab').setRequired(true)
      .addChoices(
        { name: 'Dashboard', value: 'dashboard' },
        { name: 'Resumo Semanal', value: 'weekly' },
        { name: 'Resumo Diário', value: 'daily' },
        { name: 'Membros', value: 'members' },
        { name: 'Moradores', value: 'moradores' },
        { name: 'Oficiais', value: 'oficiais' },
        { name: 'Saídas', value: 'saidas' },
        { name: 'Participantes', value: 'participantes' },
        { name: 'Kills', value: 'kills' },
        { name: 'Spots', value: 'spots' },
        { name: 'Inventário', value: 'inventory' },
        { name: 'Movimentos', value: 'movements' },
        { name: 'Rankings', value: 'rankings' },
        { name: 'Auditoria', value: 'audit' },
        { name: 'Config', value: 'config' },
      )),

  new SlashCommandBuilder()
    .setName('rg-sync-sheets-rebuild')
    .setDescription('Apaga e recria todas as tabs do Google Sheet (reset de schema)'),

  // ── Sticky messages (admin, raro) ───────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-sticky-set')
    .setDescription('Configura sticky message num canal')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal alvo').setRequired(true))
    .addStringOption(opt => opt.setName('source').setDescription('Source key (ex: availability:daily, radio:current, panel:chefia)').setRequired(true))
    .addStringOption(opt => opt.setName('modo').setDescription('update (edita) ou repost (republica)').setRequired(true)
      .addChoices({ name: 'update', value: 'update' }, { name: 'repost', value: 'repost' }))
    .addIntegerOption(opt => opt.setName('threshold_msgs').setDescription('Repost após N mensagens novas').setRequired(false))
    .addIntegerOption(opt => opt.setName('threshold_minutes').setDescription('Repost após N minutos').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-sticky-remove')
    .setDescription('Remove sticky message')
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal').setRequired(true))
    .addStringOption(opt => opt.setName('source').setDescription('Source key').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-sticky-list')
    .setDescription('Lista sticky messages activas'),
];

module.exports = { commands };
