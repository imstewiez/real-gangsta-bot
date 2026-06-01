'use strict';
const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('meu-pedido')
    .setDescription('Ver o estado do teu pedido de tag'),

  new SlashCommandBuilder()
    .setName('saidas')
    .setDescription('As tuas ultimas saidas')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID de uma saida especifica').setRequired(false)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsar um membro do bairro')
    .addUserOption(opt => opt.setName('membro').setDescription('Membro a expulsar').setRequired(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Motivo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('primeira-vez')
    .setDescription('Guia rapido para usar a comunidade'),
];

module.exports = { commands };
