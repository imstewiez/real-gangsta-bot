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
];

module.exports = { commands };
