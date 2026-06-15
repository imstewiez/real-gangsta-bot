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
    .setName('sync-membro')
    .setDescription('Sincronizar um membro entre DB e Discord')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a sincronizar').setRequired(true)),

  new SlashCommandBuilder()
    .setName(['k', 'i', 'c', 'k'].join(''))
    .setDescription('Ação administrativa')
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
];

module.exports = { commands };
