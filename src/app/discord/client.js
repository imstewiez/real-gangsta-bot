'use strict';
/**
 * Discord Client — factory único para o bot.
 *
 * Configuração de intents centralizada aqui. Caller único: bootstrap.js.
 */

const { Client, GatewayIntentBits } = require('discord.js');

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    failIfNotExists: false,
  });
}

module.exports = { createClient };
