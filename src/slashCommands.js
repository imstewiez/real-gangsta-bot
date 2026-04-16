'use strict';
const { SlashCommandBuilder } = require('discord.js');

// ══════════════════════════════════════════════════════════════════════════════
// Slash commands — conjunto mínimo e profissional.
//
// Filosofia: painéis são a via principal de interacção. Slash commands existem
// apenas para (1) consultas rápidas que não têm painel, (2) acções raras de
// staff/admin, (3) manutenção técnica.
//
// Comandos eliminados por terem equivalente em painel:
//   top-week, top-month, top-alltime, top-bairristas → /rg-ranking cobre tudo
//   close-saida, add-item, item-set-price, items-sem-preco → painéis de chefia
//   progresso → painel bairrista
//   cemetery → minha-saida + rankings
//   sticky-set/remove/list → painel chefia stickys
//   stock-add/remove/adjust → painéis de inventário
// ══════════════════════════════════════════════════════════════════════════════

const commands = [
  // ── CAMADA 1: User-facing (consultas rápidas) ──────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-version')
    .setDescription('Versão e estado do bot'),

  new SlashCommandBuilder()
    .setName('rg-stock')
    .setDescription('Stock actual de materiais'),

  new SlashCommandBuilder()
    .setName('rg-items')
    .setDescription('Catálogo de materiais com preços'),

  new SlashCommandBuilder()
    .setName('rg-member')
    .setDescription('Ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Quem consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-meu-ponto')
    .setDescription('O teu ponto na casa — material, ranking, combate, progresso'),

  new SlashCommandBuilder()
    .setName('rg-ranking')
    .setDescription('Rankings (semanal, mensal, histórico)')
    .addStringOption(opt => opt.setName('periodo').setDescription('Período').setRequired(false)
      .addChoices(
        { name: 'Semanal', value: 'week' },
        { name: 'Mensal', value: 'month' },
        { name: 'Histórico', value: 'alltime' },
      )),

  new SlashCommandBuilder()
    .setName('rg-minha-saida')
    .setDescription('As tuas últimas saídas — kills, performance, disciplina')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID de uma saída específica').setRequired(false)),

  // ── CAMADA 2: Staff operacional ────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-kill')
    .setDescription('Registar uma kill'),

  new SlashCommandBuilder()
    .setName('rg-audit')
    .setDescription('Logs de auditoria recentes')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Registos (default 20)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-stock-check')
    .setDescription('Stock actual de um item (por casa)')
    .addStringOption(opt => opt.setName('item').setDescription('Nome do item').setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('rg-stock-transfer')
    .setDescription('Mover material entre casas')
    .addStringOption(opt => opt.setName('item').setDescription('Nome do item').setRequired(true).setAutocomplete(true))
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Unidades').setRequired(true).setMinValue(1))
    .addStringOption(opt => opt.setName('de').setDescription('Casa origem').setRequired(true)
      .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' }))
    .addStringOption(opt => opt.setName('para').setDescription('Casa destino').setRequired(true)
      .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' }))
    .addStringOption(opt => opt.setName('nota').setDescription('Nota livre').setRequired(false)),

  // ── CAMADA 3: Admin técnico ────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-rebuild-rankings')
    .setDescription('Recalcular rankings mensais + all-time'),

  new SlashCommandBuilder()
    .setName('rg-catalog-sync-prices')
    .setDescription('Carregar preços do precário oficial')
    .addStringOption(opt => opt.setName('modo').setDescription('Preços ou full').setRequired(false)
      .addChoices({ name: 'Preços', value: 'prices' }, { name: 'Full', value: 'full' })),

  new SlashCommandBuilder()
    .setName('rg-backfill-members')
    .setDescription('Importar membros Discord com role RP para a DB')
    .addStringOption(opt => opt.setName('modo').setDescription('Modo')
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  // ── CAMADA 4: Manutenção / emergência ──────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rg-sync-panels')
    .setDescription('Republicar painéis do bot'),

  new SlashCommandBuilder()
    .setName('rg-sync-perms')
    .setDescription('Sincronizar permissões Discord')
    .addStringOption(opt => opt.setName('modo').setDescription('Modo').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-layout-check')
    .setDescription('Verificar layout Discord contra lock file'),

  new SlashCommandBuilder()
    .setName('rg-reconcile')
    .setDescription('Detectar e corrigir drift DB↔Discord')
    .addStringOption(opt => opt.setName('dominio').setDescription('Área').setRequired(true)
      .addChoices(
        { name: 'Todos', value: 'all' },
        { name: 'Membros', value: 'members' },
        { name: 'Channels', value: 'channels' },
        { name: 'Sheet', value: 'sheet' },
      ))
    .addStringOption(opt => opt.setName('modo').setDescription('Modo').setRequired(true)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-retention-run')
    .setDescription('Executar políticas de retenção')
    .addStringOption(opt => opt.setName('modo').setDescription('Modo').setRequired(true)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-data-health')
    .setDescription('Snapshot da saúde dos dados'),

  new SlashCommandBuilder()
    .setName('rg-sync-sheets')
    .setDescription('Sincronizar Google Sheet'),

  new SlashCommandBuilder()
    .setName('rg-sync-sheets-tab')
    .setDescription('Sincronizar uma tab do Google Sheet')
    .addStringOption(opt => opt.setName('tab').setDescription('Tab').setRequired(true)
      .addChoices(
        { name: 'Dashboard', value: 'dashboard' },
        { name: 'Resumo & Rankings', value: 'resumo' },
        { name: 'Membros', value: 'membros' },
        { name: 'Saídas & Combate', value: 'saidas' },
        { name: 'Stock', value: 'stock' },
        { name: 'Config', value: 'config' },
      )),

  new SlashCommandBuilder()
    .setName('rg-sync-sheets-rebuild')
    .setDescription('Reconstruir Google Sheet (apaga e recria)')
    .addBooleanOption(opt => opt.setName('purge')
      .setDescription('Também apagar tabs não-canónicas')),
];

module.exports = { commands };
