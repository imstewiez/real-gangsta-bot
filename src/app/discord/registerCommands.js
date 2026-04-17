'use strict';
/**
 * Registo de slash commands na API do Discord.
 *
 * Chamado no `ready` — idempotente. Se falhar, loga erro crítico mas não aborta
 * (modo degradado). Retorna o erro para o caller decidir.
 */

const { REST, Routes } = require('discord.js');
const CONFIG = require('../../config');
const { commands } = require('../../slashCommands');
const { log, error } = require('../../logger');

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_BOT_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, CONFIG.DISCORD_GUILD_ID), {
      body: commands.map(c => c.toJSON()),
    });
    log(`[READY] ${commands.length} slash commands registados.`);
  } catch (e) {
    error(`[COMMANDS] FALHA CRÍTICA — comandos podem estar desatualizados: ${e.message}`);
    return e;
  }
}

module.exports = { registerCommands };
