'use strict';
const { SlashCommandBuilder } = require('discord.js');

// ══════════════════════════════════════════════════════════════════════════════
// Slash commands — 17 comandos, todos de 1 palavra, sem prefixo.
//
// Painéis são a via principal. Slash commands existem como atalhos rápidos,
// acções de staff e manutenção técnica.
// ══════════════════════════════════════════════════════════════════════════════

const commands = [
  // ── User-facing ────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('versao')
    .setDescription('Estado do bot, versão e saúde dos dados'),

  new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Stock actual (geral ou de um item)')
    .addStringOption(opt => opt.setName('item').setDescription('Item específico (por casa)').setRequired(false).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('catalogo')
    .setDescription('Catálogo de materiais com preços'),

  new SlashCommandBuilder()
    .setName('ficha')
    .setDescription('Ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Quem consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ponto')
    .setDescription('O teu ponto na casa — material, ranking, combate, progresso'),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Rankings da firma')
    .addStringOption(opt => opt.setName('periodo').setDescription('Período').setRequired(false)
      .addChoices(
        { name: 'Semanal', value: 'week' },
        { name: 'Mensal', value: 'month' },
        { name: 'Histórico', value: 'alltime' },
      )),

  new SlashCommandBuilder()
    .setName('saidas')
    .setDescription('As tuas últimas saídas')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID de uma saída específica').setRequired(false)),

  new SlashCommandBuilder()
    .setName('kill')
    .setDescription('Registar uma kill'),

  // ── Staff operacional ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Logs de auditoria')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Registos (default 20)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Mover material entre casas')
    .addStringOption(opt => opt.setName('item').setDescription('Item').setRequired(true).setAutocomplete(true))
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Unidades').setRequired(true).setMinValue(1))
    .addStringOption(opt => opt.setName('de').setDescription('Origem').setRequired(true)
      .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' }))
    .addStringOption(opt => opt.setName('para').setDescription('Destino').setRequired(true)
      .addChoices({ name: 'Armazém', value: 'armazem' }, { name: 'Grupo', value: 'grupo' }))
    .addStringOption(opt => opt.setName('nota').setDescription('Nota').setRequired(false)),

  // ── Admin técnico ──────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('rebuild')
    .setDescription('Recalcular rankings mensais + all-time'),

  new SlashCommandBuilder()
    .setName('precario')
    .setDescription('Carregar preços do precário oficial')
    .addStringOption(opt => opt.setName('modo').setDescription('Modo').setRequired(false)
      .addChoices({ name: 'Preços', value: 'prices' }, { name: 'Full', value: 'full' })),

  new SlashCommandBuilder()
    .setName('backfill')
    .setDescription('Importar membros Discord para a DB')
    .addStringOption(opt => opt.setName('modo').setDescription('Modo')
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  // ── Manutenção ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('perms')
    .setDescription('Sincronizar permissões Discord')
    .addStringOption(opt => opt.setName('modo').setDescription('Modo').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('reconcile')
    .setDescription('Detectar drift DB↔Discord')
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
    .setName('syncsheet')
    .setDescription('Sincronizar Google Sheet')
    .addStringOption(opt => opt.setName('tab').setDescription('Tab específica (todas se vazio)').setRequired(false)
      .addChoices(
        { name: 'Dashboard', value: 'dashboard' },
        { name: 'Resumo & Rankings', value: 'resumo' },
        { name: 'Membros', value: 'membros' },
        { name: 'Saídas & Combate', value: 'saidas' },
        { name: 'Stock', value: 'stock' },
        { name: 'Config', value: 'config' },
      )),

  new SlashCommandBuilder()
    .setName('rebuildsheet')
    .setDescription('Reconstruir Google Sheet (apaga e recria)')
    .addBooleanOption(opt => opt.setName('purge')
      .setDescription('Também apagar tabs não-canónicas')),
];

module.exports = { commands };
