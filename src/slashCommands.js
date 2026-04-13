'use strict';
const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('rg-setup')
    .setDescription('Configura painéis e inicializa o bot'),

  new SlashCommandBuilder()
    .setName('rg-sync-panels')
    .setDescription('Republica todos os painéis'),

  new SlashCommandBuilder()
    .setName('rg-stock')
    .setDescription('Consulta o stock atual de materiais'),

  new SlashCommandBuilder()
    .setName('rg-member')
    .setDescription('Consulta ficha de um membro')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-top-week')
    .setDescription('Mostra o top semanal')
    .addStringOption(opt => opt.setName('semana').setDescription('atual/anterior').setRequired(false)
      .addChoices({ name: 'Semana Atual', value: 'current' }, { name: 'Semana Anterior', value: 'previous' })),

  new SlashCommandBuilder()
    .setName('rg-create-operation')
    .setDescription('Cria uma nova operação/saída'),

  new SlashCommandBuilder()
    .setName('rg-close-operation')
    .setDescription('Fecha uma operação em curso')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID da operação').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rg-audit')
    .setDescription('Consulta logs de auditoria')
    .addIntegerOption(opt => opt.setName('limite').setDescription('Número de registos').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-items')
    .setDescription('Lista o catálogo de itens/materiais'),

  new SlashCommandBuilder()
    .setName('rg-add-item')
    .setDescription('Adiciona um item ao catálogo')
    .addStringOption(opt => opt.setName('nome').setDescription('Nome do item').setRequired(true))
    .addStringOption(opt => opt.setName('categoria').setDescription('Categoria').setRequired(true))
    .addStringOption(opt => opt.setName('unidade').setDescription('Unidade de medida').setRequired(false))
    .addNumberOption(opt => opt.setName('valor').setDescription('Valor estimado').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-sync-sheets')
    .setDescription('Exporta dados para Google Sheets'),

  new SlashCommandBuilder()
    .setName('rg-sync-structure')
    .setDescription('Sincroniza a estrutura do Discord com o template')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run (mostrar)', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-sync-roles')
    .setDescription('Reconcilia invariantes de roles em todos os membros')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),

  new SlashCommandBuilder()
    .setName('rg-bootstrap-stock')
    .setDescription('Importa stock inicial de full-inventory.json (auditável)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' }))
    .addBooleanOption(opt => opt.setName('force').setDescription('Reaplicar mesmo que já tenha corrido').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rg-kill')
    .setDescription('Regista uma kill no cemitério'),

  new SlashCommandBuilder()
    .setName('rg-cemetery')
    .setDescription('Leaderboard do cemitério'),

  new SlashCommandBuilder()
    .setName('rg-version')
    .setDescription('Mostra versão/identidade desta instância do bot'),

  new SlashCommandBuilder()
    .setName('rg-revert-residents')
    .setDescription('Reverte canais de moradores ao nome anterior aos renames do bot (via audit log)')
    .addStringOption(opt => opt.setName('modo').setDescription('dry-run (default) ou apply').setRequired(false)
      .addChoices({ name: 'Dry-run', value: 'dry-run' }, { name: 'Aplicar', value: 'apply' })),
];

module.exports = { commands };
