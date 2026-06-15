'use strict';
const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('meu-pedido')
    .setDescription('Ver o estado do teu pedido de acesso'),

  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Ver o teu perfil básico na Ballas Gang'),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Remover um membro da comunidade')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a remover').setRequired(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Motivo interno').setRequired(false)),

  new SlashCommandBuilder()
    .setName('sync-membro')
    .setDescription('Sincronizar um membro entre DB e Discord')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a sincronizar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('painel-entrada')
    .setDescription('Republicar o painel de pedido de acesso'),
];

module.exports = { commands };
